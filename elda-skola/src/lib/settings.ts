import type { PanelKind } from '../components/AppShell';
import { navFor } from '../components/AppShell';

function pagesFor(panel: PanelKind): string[] {
  return navFor(panel).map((item) => item.id);
}

const KEY = 'elda-skola:start-page';

export function defaultStartPage(panel: PanelKind): string {
  try {
    const saved = localStorage.getItem(`${KEY}:${panel}`);
    const allowed = pagesFor(panel);
    if (saved && allowed.includes(saved)) return saved;
  } catch {
    /* lagring kan vara avstängd */
  }
  return panel === 'elev' ? 'hem' : 'oversikt';
}

export function saveStartPage(panel: PanelKind, page: string): void {
  if (!pagesFor(panel).includes(page)) return;
  try {
    localStorage.setItem(`${KEY}:${panel}`, page);
  } catch {
    /* lagring kan vara avstängd */
  }
}
