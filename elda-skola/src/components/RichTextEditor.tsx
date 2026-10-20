import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Eraser,
  Eye,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Palette,
  Pencil,
  Underline,
  Unlink,
} from 'lucide-react';
import { sanitizeHtml } from '../lib/sanitize';
import { Field } from './ui';

const TEXT_COLORS = ['#26352b', '#a13c3c', '#8b621b', '#2c5b7a', '#39804b', '#6b4b8a'];
const HIGHLIGHT_COLORS = ['#fdf3c7', '#e6f4e8', '#e6eef8', '#fbe9e9', '#efe6f7'];

interface Props {
  value: string;
  onChange: (html: string) => void;
  id?: string;
  label?: string;
  hint?: string;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

/**
 * Gemensam rich text-redigerare för meddelanden och publiceringar.
 *
 * Redigeraren producerar HTML som alltid saneras innan den lämnar komponenten,
 * så det som sparas är redan begränsat till säkra element och attribut.
 * Innehåll som klistras in läggs in som ren text, aldrig som HTML.
 */
export const RichTextEditor: React.FC<Props> = ({
  value,
  onChange,
  id = 'rte',
  label = 'Meddelande',
  hint,
  placeholder,
  minHeight = 140,
  disabled,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(false);
  const [active, setActive] = useState<Record<string, boolean>>({});

  // Synka bara när värdet faktiskt skiljer sig, annars flyttas markören.
  useEffect(() => {
    const node = editorRef.current;
    if (!node || preview) return;
    const clean = sanitizeHtml(value);
    if (node.innerHTML !== clean) node.innerHTML = clean;
  }, [value, preview]);

  const emit = useCallback(() => {
    const node = editorRef.current;
    if (!node) return;
    onChange(sanitizeHtml(node.innerHTML));
  }, [onChange]);

  const refreshActive = useCallback(() => {
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        insertUnorderedList: document.queryCommandState('insertUnorderedList'),
        insertOrderedList: document.queryCommandState('insertOrderedList'),
      });
    } catch {
      /* queryCommandState kan saknas i vissa webbläsare */
    }
  }, []);

  const exec = (command: string, argument?: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, argument);
    emit();
    refreshActive();
  };

  const addLink = () => {
    const raw = window.prompt('Adress till länken (https://…)');
    if (!raw) return;
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      window.alert('Länken måste börja med http:// eller https://.');
      return;
    }
    exec('createLink', trimmed);
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    // Ren text, radbrytningar blir stycken – ingen HTML från urklipp.
    const paragraphs = text.split(/\r?\n/).filter((row) => row.length > 0);
    const html = paragraphs.map((row) => `<p>${escapeHtml(row)}</p>`).join('');
    document.execCommand('insertHTML', false, sanitizeHtml(html));
    emit();
  };

  const button = (
    command: string,
    label: string,
    icon: React.ReactNode,
    argument?: string,
    stateKey?: string,
  ) => (
    <button
      type="button"
      className={`rte-btn ${stateKey && active[stateKey] ? 'is-active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={stateKey ? Boolean(active[stateKey]) : undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => exec(command, argument)}
    >
      {icon}
    </button>
  );

  return (
    <div className="rte">
      <Field label={label} htmlFor={id} hint={hint}>
        <div className={`rte-shell ${disabled ? 'is-disabled' : ''}`}>
          <div className="rte-toolbar" role="toolbar" aria-label="Formatering">
            {button('bold', 'Fetstil', <Bold size={15} />, undefined, 'bold')}
            {button('italic', 'Kursiv', <Italic size={15} />, undefined, 'italic')}
            {button('underline', 'Understrykning', <Underline size={15} />, undefined, 'underline')}

            <span className="rte-divider" aria-hidden />

            <select
              className="rte-select"
              aria-label="Rubriknivå"
              disabled={disabled}
              defaultValue=""
              onChange={(event) => {
                const tag = event.target.value;
                if (tag) exec('formatBlock', tag);
                event.target.value = '';
              }}
            >
              <option value="">Stil</option>
              <option value="p">Brödtext</option>
              <option value="h2">Rubrik 2</option>
              <option value="h3">Rubrik 3</option>
              <option value="h4">Rubrik 4</option>
            </select>

            <select
              className="rte-select"
              aria-label="Textstorlek"
              disabled={disabled}
              defaultValue=""
              onChange={(event) => {
                const size = event.target.value;
                if (size) exec('fontSize', size);
                event.target.value = '';
              }}
            >
              <option value="">Storlek</option>
              <option value="2">Liten</option>
              <option value="3">Normal</option>
              <option value="4">Stor</option>
              <option value="5">Större</option>
            </select>

            {button('insertUnorderedList', 'Punktlista', <List size={15} />, undefined, 'insertUnorderedList')}
            {button('insertOrderedList', 'Numrerad lista', <ListOrdered size={15} />, undefined, 'insertOrderedList')}

            <span className="rte-divider" aria-hidden />

            <ColorButton
              label="Textfärg"
              icon={<Palette size={15} />}
              colors={TEXT_COLORS}
              disabled={disabled}
              onPick={(color) => exec('foreColor', color)}
            />
            <ColorButton
              label="Markeringsfärg"
              icon={<Highlighter size={15} />}
              colors={HIGHLIGHT_COLORS}
              disabled={disabled}
              onPick={(color) => exec('hiliteColor', color)}
            />

            <span className="rte-divider" aria-hidden />

            <button
              type="button"
              className="rte-btn"
              aria-label="Lägg till länk"
              title="Lägg till länk"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={addLink}
            >
              <Link2 size={15} />
            </button>
            {button('unlink', 'Ta bort länk', <Unlink size={15} />)}
            {button('removeFormat', 'Rensa formatering', <Eraser size={15} />)}

            <span className="rte-spacer" />

            <button
              type="button"
              className={`rte-btn ${preview ? 'is-active' : ''}`}
              aria-label={preview ? 'Tillbaka till redigering' : 'Förhandsgranska'}
              title={preview ? 'Tillbaka till redigering' : 'Förhandsgranska'}
              onClick={() => {
                emit();
                setPreview((current) => !current);
              }}
            >
              {preview ? <Pencil size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {preview ? (
            <div
              className="rte-preview"
              style={{ minHeight }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
            />
          ) : (
            <div
              id={id}
              ref={editorRef}
              className="rte-content"
              style={{ minHeight }}
              contentEditable={!disabled}
              role="textbox"
              aria-multiline="true"
              aria-label={label}
              data-placeholder={placeholder ?? 'Skriv här…'}
              suppressContentEditableWarning
              onInput={emit}
              onBlur={emit}
              onKeyUp={refreshActive}
              onMouseUp={refreshActive}
              onPaste={handlePaste}
            />
          )}
        </div>
      </Field>
    </div>
  );
};

const ColorButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  colors: string[];
  disabled?: boolean;
  onPick: (color: string) => void;
}> = ({ label, icon, colors, disabled, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="rte-colors">
      <button
        type="button"
        className="rte-btn"
        aria-label={label}
        title={label}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
      </button>
      {open && (
        <span className="rte-swatches" role="group" aria-label={label}>
          {colors.map((color) => (
            <button
              key={color}
              type="button"
              className="rte-swatch"
              style={{ background: color }}
              aria-label={`${label} ${color}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(color);
                setOpen(false);
              }}
            />
          ))}
        </span>
      )}
    </span>
  );
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
