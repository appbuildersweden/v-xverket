/**
 * Laddar data från backend och håller reda på laddning, fel och omladdning.
 *
 * Alla paneler använder samma mönster: visa laddningsläge medan data hämtas,
 * ett begripligt fel med möjlighet att försöka igen, ett tydligt tomläge när det
 * inte finns något — och innehållet först när data finns. Hooken ser till att
 * inget tillstånd uppdateras efter att vyn lämnats.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Result } from './db';

export interface AsyncState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  /** Hämtar om från backend. */
  reload: () => void;
  /** Uppdaterar vyn direkt efter en lyckad ändring. */
  setData: (data: T) => void;
}

export function useAsync<T>(
  loader: () => Promise<Result<T>>,
  deps: readonly unknown[] = [],
): AsyncState<T> {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);

  // Laddaren är en ny funktion varje rendering. Den hålls i en ref så att
  // effekten bara körs när beroenden (t.ex. valt id) faktiskt ändras.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(null);

    void (async () => {
      const result = await loaderRef.current();
      if (!current || !mounted.current) return;
      if (result.ok) {
        setData(result.data);
      } else {
        setData(null);
        setError(result.error);
      }
      setLoading(false);
    })();

    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { loading, error, data, reload, setData };
}
