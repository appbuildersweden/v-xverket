/**
 * Office-dokument: riktiga .docx-, .xlsx- och .pptx-filer.
 *
 * Innehållet kommer från AI:ns strukturerade svar (se `ai.ts`) och byggs här om
 * till verkliga filer med beprövade, öppen källkod-bibliotek:
 *
 * - `.docx` med `docx`
 * - `.xlsx` med `exceljs`
 * - `.pptx` med `pptxgenjs`
 *
 * Filerna skapas i minnet och laddas ner först när användaren trycker på
 * knappen — ingenting sparas automatiskt, och ingenting skickas någonstans.
 * Biblioteken laddas först när ett dokument faktiskt ska skapas, så att appens
 * vanliga start inte blir tyngre.
 *
 * Filnamnet saneras och innehållet är redan gränskontrollerat i `ai.ts`; här
 * kontrolleras dessutom att dokumentet har ett innehåll innan en fil byggs, så
 * att en tom fil aldrig presenteras som ett lyckat resultat.
 */
import {
  DOC_KIND_EXT,
  DOC_KIND_LABELS,
  DocKind,
  ExcelDoc,
  OfficeDoc,
  PptxDoc,
  WordDoc,
} from './ai';

export interface BuiltFile {
  kind: DocKind;
  fileName: string;
  /** Riktig fil som kan granskas och laddas ner. */
  blob: Blob;
  /** Filens storlek i byte. */
  bytes: number;
}

const MIME: Readonly<Record<DocKind, string>> = {
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  powerpoint:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  text: 'text/plain',
  pdf: 'application/pdf',
};

/** Rensar ett namn så att det blir ett läsbart filnamn. Svenska tecken behålls. */
function cleanNamePart(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, '-')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
}

/** Ett läsbart filnamn med rätt ändelse. */
export function officeFileName(title: string, kind: DocKind): string {
  const base =
    cleanNamePart(title || '') || cleanNamePart(DOC_KIND_LABELS[kind]) || 'elda-dokument';
  return `${base}.${DOC_KIND_EXT[kind]}`;
}

/** Kort beskrivning av innehållet, för granskningsrutan innan nedladdning. */
export function officeSummary(doc: OfficeDoc): string {
  if (doc.kind === 'word') {
    const paragraphCount = doc.sections.reduce((sum, s) => sum + s.paragraphs.length, 0);
    const bulletCount = doc.sections.reduce((sum, s) => sum + s.bullets.length, 0);
    const parts = [`${doc.sections.length} sektioner`];
    if (paragraphCount) parts.push(`${paragraphCount} stycken`);
    if (bulletCount) parts.push(`${bulletCount} punkter`);
    return parts.join(' · ');
  }
  if (doc.kind === 'excel') {
    const rowCount = doc.sheets.reduce((sum, s) => sum + s.rows.length, 0);
    return `${doc.sheets.length} blad · ${rowCount} rader`;
  }
  const bulletCount = doc.slides.reduce((sum, s) => sum + s.bullets.length, 0);
  return `${doc.slides.length} bilder · ${bulletCount} punkter`;
}

/** Sant om dokumentet har ett innehåll som går att skriva till en fil. */
export function hasContent(doc: OfficeDoc): boolean {
  if (doc.kind === 'word') {
    return doc.sections.some(
      (s) => s.heading.length > 0 || s.paragraphs.length > 0 || s.bullets.length > 0,
    );
  }
  if (doc.kind === 'excel') {
    return doc.sheets.some((s) => s.columns.length > 0);
  }
  return doc.slides.length > 0;
}

function toBlob(bytes: ArrayBuffer | Uint8Array, kind: DocKind): Blob {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // Kopian gör att filen inte delar buffert med bibliotekets interna data.
  return new Blob([view.slice()], { type: MIME[kind] });
}

/** Läser en Blob som byte. `arrayBuffer()` finns i webbläsaren; FileReader är en säkerhetslina. */
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Filen kunde inte läsas.'));
    reader.readAsArrayBuffer(blob);
  });
}

// ----------------------------------------------------------------
// Word
// ----------------------------------------------------------------

const FONT = 'Calibri';

async function buildWord(doc: WordDoc): Promise<Blob> {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    LevelFormat,
    Packer,
    Paragraph,
    TextRun,
  } = await import('docx');

  const children: InstanceType<typeof Paragraph>[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: doc.title, font: FONT, bold: true, size: 40 }),
      ],
    }),
  );

  if (doc.subtitle) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: doc.subtitle,
            font: FONT,
            italics: true,
            color: '666666',
            size: 20,
          }),
        ],
      }),
    );
  } else {
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  for (const section of doc.sections) {
    if (section.heading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 280, after: 120 },
          children: [
            new TextRun({ text: section.heading, font: FONT, bold: true, size: 28 }),
          ],
        }),
      );
    }
    for (const paragraph of section.paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 160, line: 300 },
          children: [new TextRun({ text: paragraph, font: FONT, size: 22 })],
        }),
      );
    }
    for (const bullet of section.bullets) {
      children.push(
        new Paragraph({
          numbering: { reference: 'elda-bullets', level: 0 },
          spacing: { after: 80, line: 280 },
          children: [new TextRun({ text: bullet, font: FONT, size: 22 })],
        }),
      );
    }
  }

  const word = new Document({
    creator: 'Elda',
    title: doc.title,
    description: 'Skapad av Eldas AI-assistent',
    styles: {
      default: { document: { run: { font: FONT, size: 22 } } },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, bold: true, size: 28, color: '101012' },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 0 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'elda-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(word);
  return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: MIME.word });
}

// ----------------------------------------------------------------
// Excel
// ----------------------------------------------------------------

async function buildExcel(doc: ExcelDoc): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Elda';
  workbook.title = doc.title;

  for (const sheet of doc.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow([...sheet.columns]);
    const header = worksheet.getRow(1);
    header.font = { bold: true };
    for (const row of sheet.rows) worksheet.addRow([...row]);

    // Läsbar bredd per kolumn, utifrån innehållet.
    sheet.columns.forEach((column, index) => {
      const longest = sheet.rows.reduce((max, row) => {
        const cell = row[index];
        return Math.max(max, String(cell ?? '').length);
      }, column.length);
      worksheet.getColumn(index + 1).width = Math.min(Math.max(longest + 2, 10), 48);
    });

    // Rubrikraden ligger fryst så att långa listor går att läsa.
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return toBlob(buffer as ArrayBuffer, 'excel');
}

// ----------------------------------------------------------------
// PowerPoint
// ----------------------------------------------------------------

/** Presentationens färger följer Eldas svart/vitt/grå. */
const PPT = {
  title: '101012',
  body: '2F2F35',
  muted: '6B6B72',
  accent: '101012',
} as const;

async function buildPowerpoint(doc: PptxDoc): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Elda';
  pptx.company = 'Elda';
  pptx.title = doc.title;

  const titleSlide = pptx.addSlide();
  titleSlide.addText(doc.title, {
    x: 0.6,
    y: 1.9,
    w: 8.8,
    h: 1.2,
    fontSize: 34,
    bold: true,
    color: PPT.title,
    align: 'left',
  });
  if (doc.subtitle) {
    titleSlide.addText(doc.subtitle, {
      x: 0.6,
      y: 3.1,
      w: 8.8,
      h: 0.6,
      fontSize: 16,
      color: PPT.muted,
      align: 'left',
    });
  }

  doc.slides.forEach((slide, index) => {
    const page = pptx.addSlide();
    page.addText(slide.title, {
      x: 0.6,
      y: 0.45,
      w: 8.8,
      h: 0.8,
      fontSize: 26,
      bold: true,
      color: PPT.title,
      align: 'left',
    });
    if (slide.bullets.length > 0) {
      page.addText(
        slide.bullets.map((bullet) => ({
          text: bullet,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.6,
          y: 1.5,
          w: 8.8,
          h: 3.6,
          fontSize: 16,
          color: PPT.body,
          lineSpacingMultiple: 1.3,
          align: 'left',
        },
      );
    }
    if (slide.notes) page.addNotes(slide.notes);
    page.addText(`${index + 1} / ${doc.slides.length}`, {
      x: 8.4,
      y: 5.1,
      w: 1,
      h: 0.3,
      fontSize: 10,
      color: PPT.muted,
      align: 'right',
    });
  });

  const written = await pptx.write({ outputType: 'blob' });
  if (typeof written === 'string') {
    throw new Error('Presentationen kunde inte skapas som fil. Försök igen.');
  }
  // Blob-typen från biblioteket är application/zip — filen får rätt MIME-typ av
  // oss i stället, så att operativsystemet öppnar den med rätt program.
  if (written instanceof Blob) {
    return toBlob(await blobToBytes(written), 'powerpoint');
  }
  // En Buffer är också en Uint8Array, så den fångas här.
  if (written instanceof Uint8Array) return toBlob(written, 'powerpoint');
  if (written instanceof ArrayBuffer) return toBlob(written, 'powerpoint');
  throw new Error('Presentationen kunde inte skapas som fil. Försök igen.');
}

// ----------------------------------------------------------------
// Bygge och nedladdning
// ----------------------------------------------------------------

/**
 * Bygger en riktig fil av AI:ns dokumentinnehåll. Kastar ett tydligt fel om
 * dokumentet saknar innehåll eller om ett bibliotek inte kunde skapa filen.
 */
export async function buildOfficeFile(doc: OfficeDoc): Promise<BuiltFile> {
  if (!hasContent(doc)) {
    throw new Error('Dokumentet blev tomt och kunde inte skapas. Försök igen.');
  }

  let blob: Blob;
  try {
    if (doc.kind === 'word') blob = await buildWord(doc);
    else if (doc.kind === 'excel') blob = await buildExcel(doc);
    else blob = await buildPowerpoint(doc);
  } catch (error) {
    // Tekniska detaljer hamnar i konsolen; användaren får ett begripligt fel.
    console.error('Kunde inte skapa dokumentfilen', error);
    const detail = error instanceof Error ? error.message : '';
    throw new Error(
      /tomt|kunde inte skapas/i.test(detail)
        ? detail
        : 'Filen kunde inte skapas. Försök igen om en stund.',
    );
  }

  if (!blob || blob.size === 0) {
    throw new Error('Filen blev tom och kunde inte sparas. Försök igen.');
  }

  return {
    kind: doc.kind,
    fileName: officeFileName(doc.title, doc.kind),
    blob,
    bytes: blob.size,
  };
}

/** '12,4 kB' — för granskningsrutan. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Startar en nedladdning av den färdiga filen. Anropas först när användaren
 * trycker på knappen — filen lämnar aldrig webbläsaren.
 */
export function downloadFile(file: BuiltFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Ger webbläsaren tid att börja nedladdningen innan URL:n rensas.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
