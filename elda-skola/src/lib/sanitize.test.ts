import { describe, expect, it } from 'vitest';
import { hasFormatting, htmlToText, isSanitizedHtml, sanitizeHtml } from './sanitize';

describe('sanitizeHtml', () => {
  it('kastar script och dess innehåll', () => {
    expect(sanitizeHtml('<p>Hej</p><script>alert(1)</script>')).toBe('<p>Hej</p>');
  });

  it('tar bort händelseattribut', () => {
    const clean = sanitizeHtml('<p onclick="alert(1)" style="color: red">Hej</p>');
    expect(clean).not.toContain('onclick');
    expect(clean).toContain('color: red');
  });

  it('tar bort javascript-länkar men behåller texten', () => {
    const clean = sanitizeHtml('<a href="javascript:alert(1)">Klicka</a>');
    expect(clean).not.toContain('javascript');
    expect(clean).toContain('Klicka');
  });

  it('behåller säkra länkar och sätter rel och target', () => {
    const clean = sanitizeHtml('<a href="https://example.com">Länk</a>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });

  it('tar bort relativa länkar som inte är meningsfulla i ett meddelande', () => {
    expect(sanitizeHtml('<a href="/admin">Admin</a>')).not.toContain('href');
  });

  it('behåller tillåten formatering', () => {
    const input = '<h2>Rubrik</h2><p><strong>Fet</strong> <em>kursiv</em> <u>under</u></p><ul><li>Ett</li></ul>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('kastar iframe och andra inbäddningar', () => {
    const clean = sanitizeHtml('<iframe src="https://evil.test"></iframe><p>Kvar</p>');
    expect(clean).toBe('<p>Kvar</p>');
  });

  it('behåller barnen när omslaget är okänt men ofarligt', () => {
    expect(sanitizeHtml('<article><p>Text</p></article>')).toBe('<p>Text</p>');
  });

  it('tar bort farliga stilegenskaper men behåller färg och storlek', () => {
    const clean = sanitizeHtml(
      '<span style="background-color: #ff0; font-size: 18px; background-image: url(x)">X</span>',
    );
    expect(clean).toContain('background-color: #ff0');
    expect(clean).toContain('font-size: 18px');
    expect(clean).not.toContain('url(');
  });

  it('normaliserar strike till s', () => {
    expect(sanitizeHtml('<strike>gammal</strike>')).toBe('<s>gammal</s>');
  });

  it('hanterar tomt och null', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
  });

  it('är stabilt att köra två gånger', () => {
    const once = sanitizeHtml('<p><strong>A</strong><script>x</script></p>');
    expect(sanitizeHtml(once)).toBe(once);
    expect(isSanitizedHtml(once)).toBe(true);
  });
});

describe('htmlToText', () => {
  it('gör ren text av block', () => {
    expect(htmlToText('<p>Hej</p><p>där</p>')).toBe('Hej där');
  });

  it('tar bort taggar och script', () => {
    expect(htmlToText('<strong>Fet</strong><script>alert(1)</script>')).toBe('Fet');
  });

  it('returnerar tom sträng för tomt innehåll', () => {
    expect(htmlToText('')).toBe('');
    expect(htmlToText(null)).toBe('');
  });
});

describe('hasFormatting', () => {
  it('känner igen formaterat innehåll', () => {
    expect(hasFormatting('<p>text</p>')).toBe(true);
    expect(hasFormatting('<strong>x</strong>')).toBe(true);
    expect(hasFormatting('')).toBe(false);
    expect(hasFormatting(null)).toBe(false);
  });
});
