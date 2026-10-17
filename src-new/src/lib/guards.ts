/**
 * Rutt-skydd för Elda.
 *
 * Logiken är medvetet ren och sidoeffektfri så att den kan testas direkt.
 * Den är ett *gränssnittsskydd*: den hindrar en användare från att se en panel
 * som inte hör till rollen. Den auktoritativa behörigheten ligger fortfarande i
 * Row Level Security och i Edge Functions — klienten kan aldrig bevilja sig
 * själv data genom att kringgå den här filen.
 */
import {
  Panel,
  VäxverketUser,
  canAccessPanel,
  getDefaultPanelForRole,
  isKnownRole,
  isPrivateStudent,
} from './auth-types';
import { FIRST_PAGE, isPageInPanel, isPanel } from './nav';

export interface RouteRequest {
  panel: Panel;
  page: string;
}

export interface Route {
  panel: Panel;
  page: string;
}

export type RouteDecision =
  /** Ingen giltig session — visa inloggningen. */
  | { kind: 'login' }
  /** Inloggad men utan giltig roll/aktivt konto — neka och visa förklaring. */
  | { kind: 'deny'; reason: string }
  /** Obehörig panel eller okänd sida — skicka till användarens egen panel. */
  | { kind: 'redirect'; panel: Panel; page: string; reason: string }
  /** Släpp igenom. */
  | { kind: 'allow'; panel: Panel; page: string };

export const DENY_INACTIVE = 'Kontot är inaktiverat. Kontakta administratören.';
export const DENY_NO_ROLE =
  'Ditt konto saknar en giltig roll. Kontakta administratören för att få en roll tilldelad.';
export const REDIRECT_WRONG_PANEL = 'Du har inte behörighet till den panelen.';

/** Användarens egen startrutt (rollens standardpanel). */
export function defaultRoute(user: VäxverketUser): Route {
  if (!isKnownRole(user.role)) {
    // Ska aldrig användas för en roll vi inte känner igen; ändå ett säkert val.
    return { panel: 'elev', page: FIRST_PAGE.elev };
  }
  // En elev med privat konto får privatelevpanelen — aldrig skolelevens
  // klassvyer. Detta speglas även i canAccessPanel, så en direktadress
  // (#/elev/klass) kan inte användas för att kringgå kontotypen.
  const panel: Panel = isPrivateStudent(user) ? 'privat' : getDefaultPanelForRole(user.role);
  return { panel, page: FIRST_PAGE[panel] };
}

/**
 * Avgör vad som ska visas för en begärd rutt.
 *
 * Ordning är viktig: en användare utan giltig roll nekas alltid, oavsett vilken
 * rutt som begärs — och blir aldrig automatiskt admin eller elev.
 */
export function resolveRoute(
  user: VäxverketUser | null,
  request: RouteRequest,
): RouteDecision {
  if (!user) return { kind: 'login' };
  if (!user.active) return { kind: 'deny', reason: DENY_INACTIVE };
  if (!isKnownRole(user.role)) return { kind: 'deny', reason: DENY_NO_ROLE };

  const fallback = defaultRoute(user);

  // En begäran som kommer från en URL kan innehålla vad som helst.
  if (!isPanel(request.panel)) {
    return {
      kind: 'redirect',
      ...fallback,
      reason: REDIRECT_WRONG_PANEL,
    };
  }

  if (!canAccessPanel(user, request.panel)) {
    return { kind: 'redirect', ...fallback, reason: REDIRECT_WRONG_PANEL };
  }

  if (!isPageInPanel(request.panel, request.page)) {
    return {
      kind: 'redirect',
      ...fallback,
      reason: 'Sidan finns inte i din panel.',
    };
  }

  return { kind: 'allow', panel: request.panel, page: request.page };
}

/** Ruttens mål om beslutet är allow eller redirect (för rendering). */
export function routeToRender(decision: RouteDecision): Route | null {
  if (decision.kind === 'allow' || decision.kind === 'redirect') {
    return { panel: decision.panel, page: decision.page };
  }
  return null;
}
