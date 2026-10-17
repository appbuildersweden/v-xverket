import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ExcelDoc, PptxDoc, WordDoc } from './ai';
import {
  buildOfficeFile,
  formatFileSize,
  hasContent,
  officeFileName,
  officeSummary,
} from './office';

/**
 * Dokumentgenereringen testas genom att filerna byggs på riktigt och sedan
 * öppnas igen: testet läser ZIP-strukturen i .docx/.xlsx/.pptx, packar upp
 * innehållet och kontrollerar att de delar ett Office-dokument måste ha finns
 * och att texten som AI:n skickade verkligen ligger i filen.
 *
 * Det är samma kontroll ett program som Word, Excel eller PowerPoint gör när det
 * öppnar filen — en textfil med ändelsen .docx hade fallit direkt.
 */

// ----------------------------------------------------------------
// Läsare för ZIP (Office-filer är ZIP-arkiv med XML)
// ----------------------------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Kunde inte läsa filen'));
    reader.readAsArrayBuffer(blob);
  });
}

/** Läser ZIP-arkivets innehållsförteckning (central directory). */
function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Filen är inte ett ZIP-arkiv');

  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(pointer, true) !== 0x02014b50) {
      throw new Error('Trasig innehållsförteckning i ZIP-arkivet');
    }
    const method = view.getUint16(pointer + 10, true);
    const compressedSize = view.getUint32(pointer + 20, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const offset = view.getUint32(pointer + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));
    entries.push({ name, method, compressedSize, offset });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Packar upp en fil ur arkivet till text. */
function readEntry(bytes: Uint8Array, entry: ZipEntry): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new Error(`Trasig filpost för ${entry.name}`);
  }
  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const start = entry.offset + 30 + nameLength + extraLength;
  const raw = bytes.subarray(start, start + entry.compressedSize);
  const data = entry.method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
  return new TextDecoder().decode(data);
}

async function openOfficeFile(blob: Blob) {
  const bytes = await readBytes(blob);
  const entries = zipEntries(bytes);
  const names = entries.map((e) => e.name);
  const text = (name: string): string => {
    const entry = entries.find((e) => e.name === name);
    if (!entry) throw new Error(`Saknar ${name} i filen`);
    return readEntry(bytes, entry);
  };
  const containsText = (needle: string): boolean =>
    entries
      .filter((e) => e.name.endsWith('.xml'))
      .some((e) => readEntry(bytes, e).includes(needle));
  return { bytes, names, text, containsText };
}

// ----------------------------------------------------------------
// Testinnehåll
// ----------------------------------------------------------------

const WORD: WordDoc = {
  kind: 'word',
  title: 'Arbetsblad: Bråk',
  subtitle: 'Matematik åk 7',
  sections: [
    {
      heading: 'Mål',
      paragraphs: ['Kunna jämföra bråk med olika nämnare.'],
      bullets: ['Förkorta', 'Förlänga'],
    },
    { heading: 'Övningar', paragraphs: ['Vilket bråk är störst: 3/4 eller 5/7?'], bullets: [] },
  ],
};

const EXCEL: ExcelDoc = {
  kind: 'excel',
  title: 'Närvaro',
  sheets: [
    {
      name: 'Vecka 42',
      columns: ['Elev', 'Närvaro'],
      rows: [
        ['eanna01', 100],
        ['ebert01', 80],
      ],
    },
  ],
};

const PPTX: PptxDoc = {
  kind: 'powerpoint',
  title: 'Bråk — genomgång',
  subtitle: 'Matematik åk 7',
  slides: [
    { title: 'Vad är ett bråk?', bullets: ['Täljare', 'Nämnare'], notes: 'Rita på tavlan.' },
    { title: 'Jämföra bråk', bullets: ['Gemensam nämnare'], notes: null },
  ],
};

// ----------------------------------------------------------------
// Filnamn och sammanfattning
// ----------------------------------------------------------------

describe('filnamn', () => {
  it('ger rätt ändelse och rensar bort otillåtna tecken', () => {
    expect(officeFileName('Arbetsblad: Bråk', 'word')).toBe('Arbetsblad-Brak.docx');
    expect(officeFileName('Närvaro vecka 42', 'excel')).toBe('Narvaro-vecka-42.xlsx');
    expect(officeFileName('Bråk/genomgång?', 'powerpoint')).toBe('Brak-genomgang.pptx');
  });

  it('faller tillbaka på formatets namn när titeln saknas', () => {
    expect(officeFileName('', 'word')).toBe('Word-dokument.docx');
    expect(officeFileName('!!!', 'excel')).toBe('Excel-arbetsbok.xlsx');
  });
});

describe('sammanfattning och gränser', () => {
  it('räknar innehållet så att användaren kan granska det', () => {
    expect(officeSummary(WORD)).toBe('2 sektioner · 2 stycken · 2 punkter');
    expect(officeSummary(EXCEL)).toBe('1 blad · 2 rader');
    expect(officeSummary(PPTX)).toBe('2 bilder · 3 punkter');
  });

  it('visar filstorlekar läsbart', () => {
    expect(formatFileSize(0)).toBe('—');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(4096)).toBe('4 kB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3,0 MB');
  });

  it('vägrar bygga en fil av ett tomt dokument', async () => {
    expect(hasContent({ kind: 'word', title: 'Tomt', subtitle: null, sections: [] })).toBe(false);
    await expect(
      buildOfficeFile({ kind: 'word', title: 'Tomt', subtitle: null, sections: [] }),
    ).rejects.toThrow(/tomt/i);
  });
});

// ----------------------------------------------------------------
// Filerna
// ----------------------------------------------------------------

describe('Word-dokument (.docx)', () => {
  it('skapar en riktig docx-fil med rubrik, stycken och punkter', async () => {
    const file = await buildOfficeFile(WORD);
    expect(file.fileName).toBe('Arbetsblad-Brak.docx');
    expect(file.blob.type).toContain('wordprocessingml.document');

    const opened = await openOfficeFile(file.blob);
    expect(opened.names).toContain('[Content_Types].xml');
    expect(opened.names).toContain('word/document.xml');
    expect(opened.names).toContain('_rels/.rels');

    const document = opened.text('word/document.xml');
    expect(document).toContain('Arbetsblad: Bråk');
    expect(document).toContain('Matematik åk 7');
    expect(document).toContain('Kunna jämföra bråk med olika nämnare.');
    expect(document).toContain('Förkorta');
    expect(opened.text('[Content_Types].xml')).toContain('wordprocessingml');
  });
});

describe('Excel-arbetsbok (.xlsx)', () => {
  it('skapar en riktig xlsx-fil med kolumnrubriker, rader och tal', async () => {
    const file = await buildOfficeFile(EXCEL);
    expect(file.fileName).toBe('Narvaro.xlsx');
    expect(file.blob.type).toContain('spreadsheetml.sheet');

    const opened = await openOfficeFile(file.blob);
    expect(opened.names).toContain('[Content_Types].xml');
    expect(opened.names).toContain('xl/workbook.xml');
    expect(opened.names).toContain('xl/worksheets/sheet1.xml');

    expect(opened.text('xl/workbook.xml')).toContain('Vecka 42');
    const sheet = opened.text('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<worksheet');
    // Talet ligger som ett tal i arket, inte som text.
    expect(sheet).toContain('100');
    expect(opened.containsText('eanna01')).toBe(true);
    expect(opened.containsText('Närvaro')).toBe(true);
  });
});

describe('PowerPoint-presentation (.pptx)', () => {
  it('skapar en riktig pptx-fil med titelbild och innehållsbilder', async () => {
    const file = await buildOfficeFile(PPTX);
    expect(file.fileName).toBe('Brak-genomgang.pptx');
    expect(file.blob.type).toContain('presentationml.presentation');

    const opened = await openOfficeFile(file.blob);
    expect(opened.names).toContain('[Content_Types].xml');
    expect(opened.names).toContain('ppt/presentation.xml');
    expect(opened.names).toContain('ppt/slides/slide1.xml');
    expect(opened.names).toContain('ppt/slides/slide2.xml');
    expect(opened.names).toContain('ppt/slides/slide3.xml');

    expect(opened.containsText('Bråk — genomgång')).toBe(true);
    expect(opened.containsText('Vad är ett bråk?')).toBe(true);
    expect(opened.containsText('Täljare')).toBe(true);
    expect(opened.containsText('Gemensam nämnare')).toBe(true);
  });
});
