import { FREE_THEME_KEY, safeThemeKey } from './halloween-catalog';

/**
 * Temat på <html>.
 *
 * Säsongstemat är frivilligt: appen behåller sina vanliga färger tills eleven
 * själv slår på det. Ett köpt tema vinner över det fria, och en okänd nyckel
 * (t.ex. efter en ändrad produkt) faller alltid tillbaka på standardtemat i
 * stället för att lämna appen utan färger. Valet sparas lokalt så att appen
 * inte blinkar i fel färger innan servern har svarat – servern är ändå den som
 * avgör vilka teman eleven äger.
 */

const PREFERENCE_KEY = 'elda-skola-halloween-prefs';

export interface ThemePreference {
  /** Sant när eleven har slagit på det fria säsongstemat. */
  freeTheme: boolean;
}

const DEFAULT_PREFERENCE: ThemePreference = { freeTheme: false };

export function readThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    if (!raw) return DEFAULT_PREFERENCE;
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    return { freeTheme: parsed.freeTheme === true };
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preference));
  } catch {
    /* lagring kan vara avstängd – temat fungerar ändå i den här sessionen */
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
 * det fria säsongstemat om eleven har slagit på det.
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
  if (themeKey === FREE_THEME_KEY) return 'Nattens Elda (fritt säsongstema)';
  return themeKey;
}
