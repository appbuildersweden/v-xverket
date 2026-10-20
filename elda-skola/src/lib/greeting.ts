/**
 * Tidsanpassad hälsning. Använder användarens lokala tid, så hälsningen
 * byts när ett nytt tidsintervall börjar, utan något fast klockslag.
 */

export type GreetingPeriod = 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night';

const GREETINGS: Record<GreetingPeriod, string> = {
  morning: 'God morgon',
  forenoon: 'God förmiddag',
  afternoon: 'God eftermiddag',
  evening: 'God kväll',
  night: 'God natt',
};

/** Tidsintervall för en timme 0–23. Natt är 23–05. */
export function greetingPeriod(hour: number): GreetingPeriod {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`Ogiltig timme: ${hour}`);
  }
  if (hour >= 5 && hour <= 9) return 'morning';
  if (hour >= 10 && hour <= 11) return 'forenoon';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 22) return 'evening';
  return 'night';
}

/** Hälsningen för ett givet datum. Visar förnamnet om det finns. */
export function greetingFor(date: Date, name?: string | null): string {
  const base = GREETINGS[greetingPeriod(date.getHours())];
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return first ? `${base}, ${first}!` : `${base}!`;
}
