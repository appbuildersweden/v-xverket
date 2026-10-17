/**
 * Validering av nya lösenord.
 *
 * Lösenordet lagras och hashas alltid av Supabase Auth — appen hanterar aldrig
 * lösenord i klartext, och den här filen avgör bara om inmatningen får skickas
 * vidare. Servern är auktoritativ: om den nekar bytet visas serverns fel.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Vanliga tillfälliga lösenord som inte får väljas som sitt eget. */
export const FORBIDDEN_PASSWORDS: readonly string[] = ['student123', 'losenord', 'password'];

export function validateNewPassword(
  password: string,
  confirmation: string,
  username?: string,
): string | null {
  if (!password && !confirmation) return 'Fyll i båda fälten.';
  if (!password) return 'Fyll i ett nytt lösenord.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
  }
  if (password !== confirmation) return 'Lösenorden stämmer inte överens.';
  if (FORBIDDEN_PASSWORDS.includes(password.toLowerCase())) {
    return 'Det lösenordet är för vanligt. Välj ett eget.';
  }
  const name = (username ?? '').trim().toLowerCase();
  if (name && password.toLowerCase() === name) {
    return 'Lösenordet får inte vara samma som ditt användarnamn.';
  }
  return null;
}
