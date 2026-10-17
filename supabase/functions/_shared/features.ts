/**
 * De funktionsval en lärare eller speciallärare kan spara.
 *
 * Listan är den enda källan: samma strängar finns i databasens villkor
 * (profiles_features_check), i registreringsboten och i appens meny. Ett värde
 * som inte står här kan därför aldrig sparas på en profil.
 */
export const FEATURES = [
  'Klass och elevöversikt',
  'Uppgifter och uppföljning',
  'Undervisningsmaterial',
  'Planering och att göra',
  'Belöningar och nivåer',
  'AI-stöd i undervisningen',
] as const;

export type Feature = (typeof FEATURES)[number];

/** Endast kända värden, utan dubbletter, i listans ordning. */
export function sanitizeFeatures(raw: unknown): Feature[] {
  const list = Array.isArray(raw) ? raw : [];
  const wanted = new Set(list.map((value) => String(value)));
  return FEATURES.filter((feature) => wanted.has(feature));
}
