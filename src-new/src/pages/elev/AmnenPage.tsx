import React, { useState } from 'react';
import { BookOpen, Download, FileText } from 'lucide-react';
import { AssignedTask, groupTasksBySubject, listMyTasks } from '../../lib/assignments';
import { DocumentRow, createDocumentUrl, formatBytes, listDocuments } from '../../lib/documents';
import { Result } from '../../lib/db';
import { formatDate } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import { Panel } from '../../lib/auth-types';
import { studentCopy, studentPageTestId } from '../../lib/panel-copy';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  ProgressBar,
  SectionCard,
  TaskStatusPill,
} from '../../components/ui';

interface Subject {
  name: string;
  tasks: AssignedTask[];
  documents: DocumentRow[];
  done: number;
  total: number;
}

interface Data {
  subjects: Subject[];
  hasAnything: boolean;
}

/**
 * Slår ihop uppgifter och dokument per ämne. Ämnena kommer från den data eleven
 * faktiskt har — uppgifter och material som läraren har delat. Det finns ingen
 * separat ämnestabell att fylla med påhittat innehåll.
 */
export function groupSubjects(
  tasks: readonly AssignedTask[],
  documents: readonly DocumentRow[],
): Subject[] {
  const bySubject = new Map<string, Subject>();

  const ensure = (name: string): Subject => {
    const existing = bySubject.get(name);
    if (existing) return existing;
    const created: Subject = { name, tasks: [], documents: [], done: 0, total: 0 };
    bySubject.set(name, created);
    return created;
  };

  for (const group of groupTasksBySubject(tasks)) {
    const subject = ensure(group.subject);
    subject.tasks.push(...group.tasks);
    subject.total += group.tasks.length;
    subject.done += group.tasks.filter((t) => t.status === 'klar').length;
  }

  for (const document of documents) {
    const name = document.subject?.trim() || 'Övrigt';
    ensure(name).documents.push(document);
  }

  return [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

async function loadAmnen(): Promise<Result<Data>> {
  const [tasks, documents] = await Promise.all([listMyTasks(), listDocuments()]);
  if (!tasks.ok) return tasks;
  if (!documents.ok) return documents;

  const subjects = groupSubjects(tasks.data, documents.data);
  return {
    ok: true,
    data: { subjects, hasAnything: subjects.length > 0 },
  };
}

export const AmnenPage: React.FC<{ panel?: Panel }> = ({ panel = 'elev' }) => {
  const copy = studentCopy(panel);
  const state: AsyncState<Data> = useAsync(loadAmnen);
  const [error, setError] = useState<string | null>(null);

  const openDocument = async (row: DocumentRow) => {
    const result = await createDocumentUrl(row);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.data, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="panel-page" data-testid={studentPageTestId(panel, 'amnen')}>
      <SectionCard title="Mina ämnen" subtitle="Uppgifter och material per ämne">
        {state.loading && <LoadingState label="Hämtar dina ämnen…" />}
        {!state.loading && state.error && <ErrorState message={state.error} onRetry={state.reload} />}

        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        {state.data && !state.data.hasAnything && (
          <EmptyState
            icon={<BookOpen size={22} />}
            title="Inga ämnen ännu"
            description={copy.subjectsEmpty}
          />
        )}
      </SectionCard>

      {state.data?.subjects.map((subject) => (
        <SectionCard
          key={subject.name}
          title={subject.name}
          subtitle={`${subject.total} uppgifter · ${subject.documents.length} dokument`}
        >
          {subject.total > 0 && (
            <ProgressBar
              value={subject.done}
              max={subject.total}
              label="Klara uppgifter"
              caption={`${subject.done} / ${subject.total}`}
            />
          )}

          {subject.tasks.length > 0 && (
            <ul className="list">
              {subject.tasks.map((task) => (
                <li className="list-item list-item-static" key={task.id}>
                  <div className="list-item-content">
                    <div className="list-item-title">{task.title}</div>
                    <div className="list-item-sub">
                      {task.due_date ? `Förfaller ${formatDate(task.due_date)}` : 'Inget datum'}
                    </div>
                  </div>
                  <TaskStatusPill status={task.status} />
                </li>
              ))}
            </ul>
          )}

          {subject.documents.length > 0 && (
            <ul className="list">
              {subject.documents.map((document) => (
                <li className="list-item list-item-static" key={document.id}>
                  <FileText size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title">{document.title}</div>
                    <div className="list-item-sub">
                      {formatBytes(document.size_bytes)} · {formatDate(document.created_at.slice(0, 10))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void openDocument(document)}
                  >
                    <Download size={15} /> Öppna
                  </button>
                </li>
              ))}
            </ul>
          )}

          {subject.tasks.length === 0 && subject.documents.length === 0 && (
            <EmptyState title="Inget i det här ämnet ännu" />
          )}

          {subject.total > 0 && subject.done === subject.total && (
            <Pill tone="ok">Allt klart i {subject.name}</Pill>
          )}
        </SectionCard>
      ))}
    </div>
  );
};
