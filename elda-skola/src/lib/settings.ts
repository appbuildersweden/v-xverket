import type { PanelKind } from '../components/AppShell';
import { navFor } from '../components/AppShell';
import type { PlatformFeatures } from './types';

function pagesFor(panel: PanelKind, features?: PlatformFeatures): string[] {
  return navFor(panel, features).map((item) => item.id);
}

const KEY = 'elda-skola:start-page';

/**
 * Startsidan får bara vara en sida som just nu finns i menyn. Om eleven sparat
 * butiken och skolan sedan stänger av shoppen faller vi tillbaka på en vanlig
 * startsida i stället för en tom eller avstängd vy.
 */
export function defaultStartPage(panel: PanelKind, features?: PlatformFeatures): string {
  try {
    const saved = localStorage.getItem(`${KEY}:${panel}`);
    const allowed = pagesFor(panel, features);
    if (saved && allowed.includes(saved)) return saved;
  } catch {
    /* lagring kan vara avstängd */
  }
  return panel === 'elev' ? 'hem' : 'oversikt';
}

export function saveStartPage(
  panel: PanelKind,
  page: string,
  features?: PlatformFeatures,
): void {
  if (!pagesFor(panel, features).includes(page)) return;
  try {
    localStorage.setItem(`${KEY}:${panel}`, page);
  } catch {
    /* lagring kan vara avstängd */
  }
}
