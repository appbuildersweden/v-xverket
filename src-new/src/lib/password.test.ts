import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from './password';

describe('validateNewPassword', () => {
  it('kräver att båda fälten fylls i', () => {
    expect(validateNewPassword('', '')).toMatch(/båda fälten/i);
    expect(validateNewPassword('', 'abc12345')).toMatch(/nytt lösenord/i);
  });

  it('kräver minst åtta tecken', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    const short = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateNewPassword(short, short)).toMatch(/minst 8/i);
  });

  it('kräver att bekräftelsen stämmer', () => {
    expect(validateNewPassword('hemligt123', 'hemligt124')).toMatch(/stämmer inte/i);
  });

  it('avvisar vanliga tillfälliga lösenord', () => {
    expect(validateNewPassword('student123', 'student123')).toMatch(/vanligt/i);
  });

  it('avvisar samma lösenord som användarnamnet', () => {
    expect(validateNewPassword('ejentu01', 'ejentu01', 'ejentu01')).toMatch(
      /användarnamn/i,
    );
  });

  it('släpper igenom ett giltigt lösenord', () => {
    expect(validateNewPassword('sommar2026!', 'sommar2026!', 'ejentu01')).toBeNull();
  });
});
