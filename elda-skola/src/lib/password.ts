export const MIN_PASSWORD_LENGTH = 8;

/** Enkel, begriplig validering. Servern är alltid den som avgör. */
export function validateNewPassword(
  password: string,
  confirmation: string,
  username?: string,
): string | null {
  if (!password) return 'Välj ett nytt lösenord.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Lösenordet måste vara minst ${MIN_PASSWORD_LENGTH} tecken.`;
  }
  if (password !== confirmation) return 'Lösenorden stämmer inte överens.';
  if (['password', 'losenord', 'student123'].includes(password.toLowerCase())) {
    return 'Det lösenordet är för vanligt. Välj ett eget.';
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    return 'Lösenordet får inte vara samma som ditt användarnamn.';
  }
  return null;
}
