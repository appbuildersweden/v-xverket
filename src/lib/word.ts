// Växverket — Word-generering.
// Bygger riktiga Microsoft Word-filer (.docx) från AI-ns strukturerade innehåll.
// Körs helt i webbläsaren — inga extra anrop eller filformat.

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { DocContent } from './ai';

const FONT = 'Calibri';

/** Enkla, men korrekta linjer runt en tabell används inte — vi håller ren text. */
const NO_BORDER = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
};

function heading(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: FONT, bold: true, size: 28 })],
  });
}

function body(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160, line: 300 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    numbering: { reference: 'vax-bullets', level: 0 },
    spacing: { after: 80, line: 280 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}

/**
 * Skapar ett .docx-objekt (ej Uint8Array) ur AI-ns innehåll.
 * Återanvänds om dokumentet ska sparas eller skickas vidare.
 */
export function buildDocx(content: DocContent): Document {
  const children: (Paragraph | undefined)[] = [];

  // Titel
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      border: { bottom: NO_BORDER },
      children: [
        new TextRun({
          text: content.title,
          font: FONT,
          bold: true,
          size: 40,
        }),
      ],
    }),
  );

  // Underrubrik
  if (content.subtitle && content.subtitle.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [
          new TextRun({
            text: content.subtitle,
            font: FONT,
            italics: true,
            color: '666666',
            size: 20,
          }),
        ],
      }),
    );
  } else {
    // Lite luft om ingen underrubrik finns.
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }

  for (const section of content.sections) {
    if (section.heading && section.heading.trim()) {
      children.push(heading(section.heading));
    }
    for (const p of section.paragraphs) {
      if (p.trim()) children.push(body(p));
    }
    for (const b of section.bullets) {
      if (b.trim()) children.push(bullet(b));
    }
  }

  return new Document({
    creator: 'Elda',
    title: content.title,
    description: 'Skapad av Eldas AI-assistent',
    styles: {
      default: {
        document: { run: { font: FONT, size: 22 } },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: FONT, bold: true, size: 28, color: '101012' },
          paragraph: {
            spacing: { before: 280, after: 120 },
            outlineLevel: 0,
          },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'vax-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: '•',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [{ children: children.filter(Boolean) as Paragraph[] }],
  });
}

/**
 * Genererar .docx-binar och startar en nedladdning i webbläsaren.
 * Returnerar filnamnet som användes.
 */
export async function downloadDocx(content: DocContent): Promise<string> {
  const doc = buildDocx(content);
  const blob = await Packer.toBlob(doc);
  const name = `${safeFileName(content.title)}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Ger webbläsaren tid att börja nedladdningen innan URL:n rensas.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);

  return name;
}

function safeFileName(input: string): string {
  const cleaned = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9åäöÅÄÖ _-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned || 'vaxverket-dokument';
}
