/**
 * Minimal hashbaserad rutt: #/<panel>/<sida>, t.ex. #/admin/roller.
 *
 * Den finns för att en adress som skrivs in direkt i adressfältet ska hamna i
 * samma behörighetskontroll som all annan navigering. Parsern validerar bara
 * formen — om användaren får se rutten avgörs av guards.resolveRoute, som nekar
 * okända roller och skickar obehöriga paneler till användarens egen panel.
 */
import { Panel } from './auth-types';
import { RouteRequest } from './guards';
import { isPageInPanel, isPanel } from './nav';

const PAGE_RE = /^[a-z0-9-]{1,40}$/;

/** Läser "#/panel/sida". Returnerar null om adressen inte är en giltig rutt. */
export function parseHashRoute(hash: string): RouteRequest | null {
  const raw = (hash ?? '').replace(/^#/, '').replace(/^\/+/, '');
  if (!raw) return null;

  const parts = raw.split('/').filter(Boolean);
  if (parts.length !== 2) return null;

  const [panel, page] = parts;
  if (!isPanel(panel)) return null;
  if (!PAGE_RE.test(page)) return null;
  if (!isPageInPanel(panel, page)) return null;

  return { panel: panel as Panel, page };
}

/** Bygger adressen för en rutt. */
export function formatHashRoute(route: RouteRequest): string {
  return `#/${route.panel}/${route.page}`;
}
