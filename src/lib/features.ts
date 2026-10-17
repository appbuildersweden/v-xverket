/**
 * Lärarnas funktionsval.
 *
 * Samma strängar som servern (supabase/functions/_shared/features.ts) och
 * databasens villkor använder. Ett val som inte står här kan aldrig sparas, och
 * ett sparat val motsvarar alltid en meny som faktiskt finns i panelen.
 */
export const TEACHER_FEATURES = [
  'Klass och elevöversikt',
  'Uppgifter och uppföljning',
  'Undervisningsmaterial',
  'Planering och att göra',
  'Belöningar och nivåer',
  'AI-stöd i undervisningen',
] as const;

export type TeacherFeature = (typeof TEACHER_FEATURES)[number];

export function isTeacherFeature(value: string): value is TeacherFeature {
  return (TEACHER_FEATURES as readonly string[]).includes(value);
}
