/**
 * Temabilderna.
 *
 * Varje UI-tema har en egen bild i `assets/teman/<nyckel>.webp`. Filerna hittas
 * vid bygget, precis som ikonerna, och följer därför med både i webbversionen
 * och i den installerade appen — inget tema hämtas från en extern adress.
 *
 * Bakgrunden används på två ställen: som appens bakgrund när temat är aktivt
 * (via CSS-variabeln `--tema-bakgrund`) och i butikens förhandsvisning (via
 * `themeBackground`). Byter du bild: lägg den nya filen med samma namn i mappen
 * och kör `scripts/forbered-teman.py`.
 */
const THEME_BACKGROUNDS = import.meta.glob('../assets/teman/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** Adressen till ett temas bakgrundsbild, eller null när filen saknas. */
export function themeBackground(themeKey: string | null | undefined): string | null {
  if (!themeKey) return null;
  return THEME_BACKGROUNDS[`../assets/teman/${themeKey}.webp`] ?? null;
}

/** Alla temanycklar som har en bild i projektet. */
export function availableThemeKeys(): string[] {
  return Object.keys(THEME_BACKGROUNDS).map((path) =>
    path.replace('../assets/teman/', '').replace('.webp', ''),
  );
}
