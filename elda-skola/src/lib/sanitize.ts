/**
 * Sanering av formaterat innehåll.
 *
 * Allt användarinnehåll som ska visas som HTML passerar den här funktionen –
 * både det som redigeraren producerar och det som kommer tillbaka från
 * databasen. Saneringen är en allowlist: okända element och attribut tas bort,
 * aldrig "städas" med svartlistor som går att kringgå.
 *
 * Servern kontrollerar dessutom innehållet innan det sparas, så ett eget
 * API-anrop kan inte lagra skadlig HTML.
 */

/** Element som får finnas i formaterat innehåll. */
const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'div',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'span',
  'a',
]);

/** Attribut per element. Allt annat tas bort, inklusive alla on*-attribut. */
const ALLOWED_ATTRS: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  span: ['style'],
  p: ['style'],
  div: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  h4: ['style'],
  li: ['style'],
};

/** Endast ofarliga stilegenskaper med ofarliga värden. */
const ALLOWED_STYLES = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
]);

/** Element vars innehåll kastas helt, inte bara skalet. */
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
  'svg',
  'math',
  'template',
  'noscript',
]);

/** Tillåtna scheman i länkar. Allt annat (javascript:, data:, vbscript:) tas bort. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  // Relativa länkar är inte meningsfulla i ett meddelande.
  try {
    const url = new URL(value, 'https://elda.invalid');
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    if (url.hostname === 'elda.invalid') return null;
    return value;
  } catch {
    return null;
  }
}

function safeStyle(raw: string | null): string {
  if (!raw) return '';
  const kept: string[] = [];
  for (const declaration of raw.split(';')) {
    const index = declaration.indexOf(':');
    if (index < 0) continue;
    const property = declaration.slice(0, index).trim().toLowerCase();
    const value = declaration.slice(index + 1).trim();
    if (!ALLOWED_STYLES.has(property)) continue;
    if (!value) continue;
    if (value.length > 80) continue;
    if (/url\s*\(|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding/i.test(value)) continue;
    if (!/^[#a-zA-Z0-9.,%()\s-]+$/.test(value)) continue;
    kept.push(`${property}: ${value}`);
  }
  return kept.join('; ');
}

function sanitizeNode(node: Node, doc: Document): Node | null {
  if (node.nodeType === 3) {
    return doc.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== 1) return null;

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (DROP_WITH_CONTENT.has(tag)) return null;

  if (!ALLOWED_TAGS.has(tag)) {
    // Okänt men ofarligt omslag: behåll barnen, kasta skalet.
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      const clean = sanitizeNode(child, doc);
      if (clean) fragment.appendChild(clean);
    }
    return fragment;
  }

  const clean = doc.createElement(tag === 'strike' ? 's' : tag);

  const allowed = ALLOWED_ATTRS[tag] ?? [];
  for (const name of allowed) {
    const value = element.getAttribute(name);
    if (value === null) continue;

    if (name === 'style') {
      const style = safeStyle(value);
      if (style) clean.setAttribute('style', style);
      continue;
    }
    if (name === 'href') {
      const href = safeUrl(value);
      if (href) clean.setAttribute('href', href);
      continue;
    }
    if (name === 'target') continue; // sätts alltid nedan
    if (name === 'rel') continue; // sätts alltid nedan
    clean.setAttribute(name, value.slice(0, 300));
  }

  if (tag === 'a' && clean.getAttribute('href')) {
    clean.setAttribute('target', '_blank');
    clean.setAttribute('rel', 'noopener noreferrer');
  }

  for (const child of Array.from(element.childNodes)) {
    const childClean = sanitizeNode(child, doc);
    if (childClean) clean.appendChild(childClean);
  }

  // Tomt omslag utan innehåll och utan radbrytning tar ingen plats.
  if (tag !== 'br' && clean.childNodes.length === 0 && !clean.getAttribute('style')) {
    return null;
  }

  return clean;
}

/** Sanerar HTML och returnerar endast tillåtna element och attribut. */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  if (typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = input;

  const container = document.createElement('div');
  for (const child of Array.from(template.content.childNodes)) {
    const clean = sanitizeNode(child, document);
    if (clean) container.appendChild(clean);
  }
  return container.innerHTML;
}

/**
 * Snabbkontroll som används innan något skickas: sant när innehållet redan är
 * sanerat. Skiljer sig från serverns kontroll, som bara avvisar uppenbart
 * farliga konstruktioner.
 */
export function isSanitizedHtml(input: string): boolean {
  return sanitizeHtml(input) === input;
}

/** Ren text av formaterat innehåll, för förhandsvisning och ämnesrader. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  if (typeof document === 'undefined') return input.replace(/<[^>]*>/g, ' ');
  const template = document.createElement('template');
  template.innerHTML = sanitizeHtml(input);
  for (const block of Array.from(template.content.querySelectorAll('p, div, li, h1, h2, h3, h4, br'))) {
    block.appendChild(document.createTextNode(' '));
  }
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Sant när innehållet innehåller något som ska visas som formaterad text. */
export function hasFormatting(html: string | null | undefined): boolean {
  if (!html) return false;
  return /<(strong|b|em|i|u|s|h[1-4]|ul|ol|li|a|blockquote|span|p|div)\b/i.test(html);
}
