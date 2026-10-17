import React, { useState } from 'react';
import { Download, Eye, FileText, Paperclip, Upload } from 'lucide-react';
import {
  DocumentRow,
  MAX_FILE_BYTES,
  createDocumentUrl,
  deleteDocument,
  documentFileName,
  documentKindLabel,
  formatBytes,
  listDocuments,
  uploadDocument,
} from '../lib/documents';
import { useAuth } from '../lib/AuthContext';
import { useAsync } from '../lib/useAsync';
import { EmptyState, ErrorState, LoadingState, Pill } from './ui';

interface Props {
  taskId: string;
  /**
   * `elev` visar uppgiftens material och låter eleven ladda upp sin egen fil.
   * `personal` visar materialet och de filer eleven har lämnat in.
   */
  mode: 'elev' | 'personal';
}

/**
 * Filerna som hör till en uppgift.
 *
 * Materialet är personalens filer som kopplats till uppgiften; eleven ser dem och
 * kan öppna dem. En elev kan dessutom ladda upp sin egen inlämning här — filen
 * lagras med eleven som ägare och är bara läsbar för eleven och den personal som
 * är kopplad till eleven, aldrig för klasskamrater.
 *
 * Är lagringen inte konfigurerad visas det i stället för en uppladdning som inte
 * fungerar.
 */
export const TaskFiles: React.FC<Props> = ({ taskId, mode }) => {
  const { user } = useAuth();
  const files = useAsync(() => listDocuments({ taskId }), [taskId]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const myId = user?.id ?? '';
  const all = files.data ?? [];
  const ownFiles = all.filter((row) => row.owner_id === myId);
  const otherFiles = all.filter((row) => row.owner_id !== myId);

  // Personalens egen uppladdning är materialet; elevens egen uppladdning är
  // inlämningen. Vyn visar båda, men med rätt etikett beroende på roll.
  const material = mode === 'personal' ? ownFiles : otherFiles;
  const submissions = mode === 'personal' ? otherFiles : ownFiles;

  const open = async (row: DocumentRow, download: boolean) => {
    setError(null);
    const result = await createDocumentUrl(row, { download });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data, '_blank', 'noopener,noreferrer');
  };

  const remove = async (row: DocumentRow) => {
    setError(null);
    const result = await deleteDocument(row);
    if (result.ok) files.reload();
    else setError(result.error);
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await uploadDocument({
      file,
      title: file.name,
      description: '',
      subject: '',
      studentId: myId,
      classId: null,
      taskId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(`"${result.data.title}" är uppladdad. Din lärare kan se den.`);
    files.reload();
  };

  return (
    <div className="task-files" data-testid={`task-files-${taskId}`}>
      <div className="list-item-title">
        <Paperclip size={14} aria-hidden="true" /> Material och filer
      </div>

      {files.loading && <LoadingState label="Hämtar filer…" />}
      {!files.loading && files.error && (
        <ErrorState message={files.error} onRetry={files.reload} />
      )}

      {error && (
        <p className="field-hint field-hint-error" role="alert" data-testid="task-files-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="field-hint" role="status" data-testid="task-files-notice">
          {notice}
        </p>
      )}

      {!files.loading && all.length === 0 && !error && (
        <EmptyState
          title={mode === 'elev' ? 'Inget material till uppgiften' : 'Inga filer ännu'}
          description={
            mode === 'elev'
              ? 'Din lärare har inte lagt till någon fil. Du kan ladda upp din egen inlämning nedan.'
              : 'Eleven har inte lämnat in någon fil och inget material är kopplat.'
          }
        />
      )}

      {material.length > 0 && (
        <>
          <div className="list-item-sub">
            {mode === 'personal' ? 'Material du har lagt till' : 'Material från din lärare'}
          </div>
          <ul className="list">
            {material.map((row) => (
              <li className="list-item list-item-static" key={row.id}>
                <FileText size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{row.title}</div>
                  <div className="list-item-sub">
                    {documentFileName(row)} · {formatBytes(row.size_bytes)}
                  </div>
                </div>
                <Pill tone="muted">{documentKindLabel(row)}</Pill>
                <Pill tone="info">Material</Pill>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void open(row, false)}
                >
                  <Eye size={15} /> Öppna
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void open(row, true)}
                >
                  <Download size={15} /> Ladda ner
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {submissions.length > 0 && (
        <>
          <div className="list-item-sub">
            {mode === 'elev' ? 'Dina inlämnade filer' : 'Elevens inlämnade filer'}
          </div>
          <ul className="list">
            {submissions.map((row) => (
              <li className="list-item list-item-static" key={row.id}>
                <FileText size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title">{row.title}</div>
                  <div className="list-item-sub">
                    {documentFileName(row)} · {formatBytes(row.size_bytes)}
                  </div>
                </div>
                <Pill tone="muted">{documentKindLabel(row)}</Pill>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => void open(row, true)}
                >
                  <Download size={15} /> Ladda ner
                </button>
                {mode === 'elev' && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void remove(row)}
                  >
                    Ta bort
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === 'personal' && otherFiles.length === 0 && all.length > 0 && (
        <p className="field-hint">
          Eleven har inte lämnat in någon fil till den här uppgiften ännu.
        </p>
      )}

      {mode === 'elev' && (
        <div className="field">
          <label htmlFor={`task-file-${taskId}`}>Lämna in en fil</label>
          <input
            id={`task-file-${taskId}`}
            className="input"
            type="file"
            disabled={busy}
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) void upload(selected);
              e.target.value = '';
            }}
          />
          <p className="field-hint">
            <Upload size={13} aria-hidden="true" /> PDF, bild, text, Word, Excel eller PowerPoint.
            Max {formatBytes(MAX_FILE_BYTES)}. Bara du och din lärare ser filen.
          </p>
        </div>
      )}
    </div>
  );
};
