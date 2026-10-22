import { FREE_THEME_KEY, THEME_META, safeThemeKey } from './halloween-catalog';

/**
 * Temat på <html>.
 *
 * Säsongstemat är frivilligt: appen behåller sina vanliga färger tills eleven
 * själv slår på det. Ett köpt tema vinner över det fria, och en okänd nyckel
 * (t.ex. efter en ändrad produkt) faller alltid tillbaka på standardtemat i
 * stället för att lämna appen utan färger. Servern är den som avgör vilka
 * teman eleven äger – klienten läser bara det som redan är utrustat.
 *
 * Invändningen sparas per konto. Nyckeln innehåller användarens id, så två
 * elever som lånar samma dator aldrig ärver varandras val: den som loggar in
 * får sitt eget tema, och en elev utan tema får appens vanliga färger.
 */

const PREFERENCE_PREFIX = 'elda-skola-tema-prefs:';

/** Gammal nyckel utan konto – läses aldrig, städas bort när ett konto loggar in. */
const LEGACY_PREFERENCE_KEY = 'elda-skola-halloween-prefs';

export interface ThemePreference {
  /** Sant när eleven har slagit på det fria säsongstemat. */
  freeTheme: boolean;
}

const DEFAULT_PREFERENCE: ThemePreference = { freeTheme: false };

const storageKey = (userId: string) => `${PREFERENCE_PREFIX}${userId}`;

export function readThemePreference(userId: string | null | undefined): ThemePreference {
  if (!userId) return DEFAULT_PREFERENCE;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    return { freeTheme: parsed.freeTheme === true };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writeThemePreference(
  userId: string | null | undefined,
  preference: ThemePreference,
): void {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ freeTheme: preference.freeTheme }));
  } catch {
    /* lagring kan vara avstängd – temat fungerar ändå i den här sessionen */
  }
}

/**
 * Tar bort gamla globala valet. Det skrevs innan temat var personligt och
 * skulle annars kunna slå på säsongstemat åt nästa person vid samma dator.
 */
export function clearLegacyThemePreference(): void {
  try {
    localStorage.removeItem(LEGACY_PREFERENCE_KEY);
  } catch {
    /* inget att städa om lagringen är avstängd */
  }
}

/** Sätter `data-ui-tema` på dokumentets rot. Null tar bort attributet. */
export function applyTheme(themeKey: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const safe = safeThemeKey(themeKey);
  if (safe) root.dataset.uiTema = safe;
  else delete root.dataset.uiTema;
}

/**
 * Vilket tema som ska gälla. Ett köpt tema har alltid företräde; annars gäller
 * det fria säsongstemat om eleven har slagit på det. Ett tema som inte är
 * utrustat på servern skickas aldrig in hit, så ett köpt tema kan bara synas
 * för den som äger det.
 */
export function resolveThemeKey(
  equippedThemeKey: string | null | undefined,
  preference: ThemePreference,
): string | null {
  const purchased = safeThemeKey(equippedThemeKey);
  if (purchased && purchased !== FREE_THEME_KEY) return purchased;
  if (preference.freeTheme) return FREE_THEME_KEY;
  return null;
}

/** Etikett för det aktiva temat, för statusraden i Halloween-vyn. */
export function describeTheme(themeKey: string | null): string {
  if (!themeKey) return 'Standardtema';
  const label = THEME_META[themeKey]?.label ?? themeKey;
  if (themeKey === FREE_THEME_KEY) return `${label} (fritt säsongstema)`;
  return label;
}
