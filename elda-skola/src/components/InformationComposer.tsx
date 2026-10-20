import React, { useMemo, useRef, useState } from 'react';
import { Paperclip, Send, X } from 'lucide-react';
import { Alert, Avatar, Button, Field, Modal } from './ui';
import { RichTextEditor } from './RichTextEditor';
import { sendInformation } from '../lib/api';
import {
  ATTACHMENT_ACCEPT,
  attachmentSize,
  removeInformationAttachment,
  uploadInformationAttachment,
} from '../lib/attachments';
import { htmlToText } from '../lib/sanitize';
import type { InformationAttachment, SchoolClass } from '../lib/types';

interface Props {
  /** Klasser avsändaren får skicka till. */
  classes: Array<Pick<SchoolClass, 'id' | 'name'>>;
  onClose: () => void;
  onSent: (count: number) => void | Promise<void>;
}

/**
 * Composer för information. Samma upplägg som meddelandeformuläret – mottagare,
 * formaterad text, bilaga och en grön skicka-knapp – så att det känns igen från
 * meddelandena. Klasserna är mottagare eftersom information alltid gäller en
 * eller flera klasser.
 */
export const InformationComposer: React.FC<Props> = ({ classes, onClose, onSent }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(classes.length === 1 ? [classes[0].id] : []);
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [pending, setPending] = useState<InformationAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return classes;
    return classes.filter((row) => row.name.toLowerCase().includes(needle));
  }, [classes, query]);

  const toggle = (id: string) =>
    setSelected((rows) => (rows.includes(id) ? rows.filter((row) => row !== id) : [...rows, id]));

  const attach = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadInformationAttachment(file);
        setPending((rows) => [...rows, uploaded]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Filen kunde inte laddas upp.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const remove = async (row: InformationAttachment) => {
    setPending((rows) => rows.filter((item) => item.storage_path !== row.storage_path));
    await removeInformationAttachment(row.storage_path).catch(() => undefined);
  };

  const cancel = async () => {
    for (const row of pending) {
      await removeInformationAttachment(row.storage_path).catch(() => undefined);
    }
    onClose();
  };

  const send = async () => {
    const text = htmlToText(html).trim();
    if (selected.length === 0) {
      setError('Välj minst en mottagare.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Ge informationen en rubrik.');
      return;
    }
    if (!text) {
      setError('Skriv informationen innan du skickar den.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const count = await sendInformation({
        title,
        body: text,
        bodyHtml: html,
        classIds: selected,
        attachments: pending,
      });
      await onSent(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Informationen kunde inte skickas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title="Ny information"
      onClose={() => void cancel()}
      footer={
        <>
          <Button variant="ghost" onClick={() => void cancel()}>
            Avbryt
          </Button>
          <Button icon={<Send size={15} />} loading={busy} onClick={() => void send()}>
            Skicka
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}

      {classes.length === 0 ? (
        <p className="small muted">
          Du har ingen klass att skicka till ännu. Klassen skapas av en lärare eller administratör.
        </p>
      ) : (
        <>
          <Field
            label="Mottagare"
            htmlFor="info-search"
            hint="Sök bland de klasser du får skicka till."
            required
          >
            <input
              id="info-search"
              className="input"
              placeholder="Sök klass"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>

          <div className="contact-list" role="list">
            {filtered.length === 0 ? (
              <p className="small muted">Inga träffar.</p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="listitem"
                  className={`contact-item ${selected.includes(row.id) ? 'is-active' : ''}`}
                  onClick={() => toggle(row.id)}
                  aria-pressed={selected.includes(row.id)}
                >
                  <Avatar name={row.name} size={30} />
                  <span>
                    <strong>{row.name}</strong>
                    <span className="small muted"> · klass</span>
                  </span>
                </button>
              ))
            )}
          </div>

          <Field label="Rubrik" htmlFor="info-title" required>
            <input
              id="info-title"
              className="input"
              maxLength={200}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>

          <RichTextEditor
            id="info-body"
            label="Meddelande"
            placeholder="Skriv ditt meddelande…"
            value={html}
            onChange={setHtml}
          />

          {pending.length > 0 && (
            <div className="attachment-list">
              {pending.map((row) => (
                <span key={row.storage_path} className="attachment-chip">
                  <Paperclip size={14} aria-hidden />
                  <span>{row.file_name}</span>
                  <span className="small muted">{attachmentSize(row.size_bytes)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Ta bort ${row.file_name}`}
                    onClick={() => void remove(row)}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              id="info-attach"
              onChange={(event) => void attach(event.target.files)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Paperclip size={15} />}
              loading={uploading}
              onClick={() => fileInput.current?.click()}
            >
              Bifoga fil
            </Button>
            <span className="small muted">PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG · max 10 MB</span>
          </div>
        </>
      )}
    </Modal>
  );
};
