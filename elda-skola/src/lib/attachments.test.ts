import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  attachmentSize,
  validateAttachment,
} from './attachments';

function file(name: string, type: string, size = 1024): File {
  const content = new Uint8Array(Math.min(size, 64 * 1024));
  const created = new File([content], name, { type });
  Object.defineProperty(created, 'size', { value: size });
  return created;
}

describe('validateAttachment', () => {
  it('tillåter de dokumenttyper skolan använder', () => {
    for (const type of ALLOWED_ATTACHMENT_TYPES) {
      const name = `fil.${type.ext[0]}`;
      expect(validateAttachment(file(name, type.mime))).toBeNull();
    }
    expect(validateAttachment(file('bild.jpeg', 'image/jpeg'))).toBeNull();
  });

  it('avvisar filer som är för stora', () => {
    const problem = validateAttachment(file('stor.pdf', 'application/pdf', MAX_ATTACHMENT_BYTES + 1));
    expect(problem).toMatch(/för stor/);
  });

  it('avvisar tomma filer', () => {
    expect(validateAttachment(file('tom.txt', 'text/plain', 0))).toMatch(/tom/);
  });

  it('avvisar filtyper som inte är tillåtna', () => {
    expect(validateAttachment(file('program.exe', 'application/x-msdownload'))).toMatch(
      /stöds inte/,
    );
    expect(validateAttachment(file('sida.html', 'text/html'))).toMatch(/stöds inte/);
  });

  it('avvisar en fil vars innehållstyp inte stämmer med filnamnet', () => {
    expect(validateAttachment(file('rapport.pdf', 'image/png'))).toMatch(/inte vara av den typ/);
  });

  it('accepterar en generisk innehållstyp när filändelsen är tillåten', () => {
    expect(validateAttachment(file('rapport.pdf', 'application/octet-stream'))).toBeNull();
  });
});

describe('attachmentSize', () => {
  it('formaterar byte, kilobyte och megabyte', () => {
    expect(attachmentSize(512)).toBe('512 B');
    expect(attachmentSize(2048)).toBe('2 kB');
    expect(attachmentSize(2 * 1024 * 1024)).toBe('2,0 MB');
  });

  it('hanterar saknat värde', () => {
    expect(attachmentSize(null)).toBe('—');
    expect(attachmentSize(undefined)).toBe('—');
  });
});
