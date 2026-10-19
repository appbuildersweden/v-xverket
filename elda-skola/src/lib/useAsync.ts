import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './supabase';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (value: T | null) => void;
}

/**
 * Hämtar data en gång per beroendelista och håller reda på laddning och fel.
 * Ett svar som kommer efter att komponenten bytt data eller avmonterats kastas,
 * så att en gammal klass eller elev aldrig skriver över en ny.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const enabled = options.enabled !== false;

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (current === generation.current) setData(result);
    } catch (err) {
      if (current === generation.current) {
        setError(errorMessage(err));
        setData(null);
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
    return () => {
      generation.current += 1;
    };
  }, [run]);

  return { data, loading, error, reload: run, setData };
}
