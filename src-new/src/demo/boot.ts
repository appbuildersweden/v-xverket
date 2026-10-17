/**
 * Start av demoläget.
 *
 * Modulen importeras bara från `main.tsx` inuti en `import.meta.env.DEV`-gren,
 * och importerar själv demoklienten statiskt. I produktionsbygget är grenen
 * alltid falsk, så varken den här filen eller exempeldata hamnar i bundeln.
 */
import { createDemoClient } from './client';
import { demoRequested, demoSupported, registerDemoClient, setDemoRequested } from '../lib/demo-mode';

/** Startar demoläget: registrerar den lokala klienten som appens transport. */
export async function enableDemo(): Promise<void> {
  if (!demoSupported()) return;
  setDemoRequested(true);
  registerDemoClient(createDemoClient());
}

/**
 * Startar demoläget när adressen innehåller `?demo=1` (eller när det redan är
 * påslaget i den här fliken). Parametern tas bort från adressfältet så att den
 * inte följer med vidare navigering, medan valet ligger kvar i sessionStorage.
 */
export async function startDemoFromAddress(): Promise<void> {
  if (!demoSupported()) return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('demo') === '1') {
      setDemoRequested(true);
      url.searchParams.delete('demo');
      window.history.replaceState(null, '', url.toString());
    }
  } catch {
    /* ingen läsbar adress — då finns inget demoläge att starta */
  }
  if (demoRequested()) await enableDemo();
}
