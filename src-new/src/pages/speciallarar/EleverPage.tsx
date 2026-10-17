import React, { useState } from 'react';
import { ArrowLeft, MessageSquare, Plus, Search, UserPlus, Users } from 'lucide-react';
import {
  StudentSummary,
  filterStudents,
  linkStudent,
  listLinkableStudents,
  listMyStudents,
  sortStudents,
  unlinkStudent,
} from '../../lib/students';
import {
  AssignedTask,
  assignmentStage,
  countAssignedTasks,
  listAssignedTasks,
  markFollowUp,
  sortAssignedTasks,
} from '../../lib/assignments';
import { openDirectChannel } from '../../lib/chat';
import { TaskFiles } from '../../components/TaskFiles';
import { formatDate } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
  StatCard,
  TaskStagePill,
  Toolbar,
} from '../../components/ui';
import { ConfirmButton, Modal } from '../../components/forms';
import { AssignmentForm } from '../../components/AssignmentForm';
import { MessageThread } from '../../components/MessageThread';

interface Props {
  onNavigate: (pageId: string) => void;
}

/**
 * Mina elever. En speciallärare ser bara de elever som är kopplade till hen —
 * det avgörs av databasen, inte av den här vyn.
 */
export const EleverPage: React.FC<Props> = ({ onNavigate }) => {
  const students = useAsync(listMyStudents);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const selected = students.data?.find((s) => s.id === selectedId) ?? null;

  const handleUnlink = async (student: StudentSummary) => {
    const result = await unlinkStudent(student.id);
    if (result.ok) {
      setSelectedId(null);
      students.reload();
    } else {
      setLinkError(result.error);
    }
  };

  if (selected) {
    return (
      <StudentDetail
        student={selected}
        onBack={() => setSelectedId(null)}
        onUnlink={() => void handleUnlink(selected)}
      />
    );
  }

  const visible = sortStudents(filterStudents(students.data ?? [], query));

  return (
    <div className="panel-page" data-testid="page-speciallarar-elever">
      <SectionCard
        title="Mina elever"
        subtitle="Elever som är kopplade till dig"
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setLinkError(null);
              setShowLink(true);
            }}
          >
            <UserPlus size={16} /> Koppla elev
          </button>
        }
      >
        {students.loading && <LoadingState label="Hämtar dina elever…" />}
        {!students.loading && students.error && (
          <ErrorState message={students.error} onRetry={students.reload} />
        )}

        {linkError && (
          <div className="state-note state-note-error" role="alert">
            {linkError}
          </div>
        )}

        {students.data && students.data.length > 0 && (
          <Toolbar>
            <div className="search-field">
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                className="input"
                placeholder="Sök på användarnamn"
                aria-label="Sök elev"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <span className="muted">
              {visible.length} av {students.data.length} elever
            </span>
          </Toolbar>
        )}

        {students.data && students.data.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga elever kopplade ännu"
            description="Koppla en elev för att kunna följa planering, uppgifter och uppföljning."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowLink(true)}
              >
                <UserPlus size={16} /> Koppla din första elev
              </button>
            }
          />
        )}

        {students.data && students.data.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<Search size={22} />}
            title="Inga träffar"
            description="Ingen elev matchar sökningen. Prova ett annat användarnamn."
          />
        )}

        {visible.length > 0 && (
          <ul className="list">
            {visible.map((student) => (
              <li className="list-item list-item-static" key={student.id}>
                <Users size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{student.username}</div>
                  <div className="list-item-sub">
                    {student.openTasks} öppna · {student.doneTasks} klara · kopplad{' '}
                    {formatDate(student.linkedAt.slice(0, 10))}
                  </div>
                </div>
                {student.overdueTasks > 0 && <Pill tone="warn">{student.overdueTasks} försenade</Pill>}
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectedId(student.id)}
                >
                  Öppna
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {showLink && (
        <LinkStudentModal
          onClose={() => setShowLink(false)}
          onLinked={() => {
            setShowLink(false);
            students.reload();
          }}
        />
      )}

      <SectionCard title="Fler genvägar" subtitle="Andra delar som hör ihop">
        <div className="quick-row">
          <button type="button" className="quick-link" onClick={() => onNavigate('meddelande-elever')}>
            <MessageSquare size={17} /> Meddelande-elever
          </button>
          <button type="button" className="quick-link" onClick={() => onNavigate('uppfoljning')}>
            <Plus size={17} /> Uppgifter och uppföljning
          </button>
        </div>
      </SectionCard>

    </div>
  );
};

const LinkStudentModal: React.FC<{ onClose: () => void; onLinked: () => void }> = ({
  onClose,
  onLinked,
}) => {
  const candidates = useAsync(listLinkableStudents);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const link = async (id: string) => {
    setBusyId(id);
    const result = await linkStudent(id);
    setBusyId(null);
    if (result.ok) onLinked();
    else setError(result.error);
  };

  return (
    <Modal title="Koppla elev" onClose={onClose} closeLabel="Stäng koppla elev">
      {candidates.loading && <LoadingState label="Hämtar elevkonton…" />}
      {!candidates.loading && candidates.error && (
        <ErrorState message={candidates.error} onRetry={candidates.reload} />
      )}
      {error && (
        <div className="state-note state-note-error" role="alert">
          {error}
        </div>
      )}

      {candidates.data && candidates.data.length === 0 && (
        <EmptyState
          title="Inga lediga elevkonton"
          description="Alla aktiva elevkonton är redan kopplade till dig, eller så finns inga konton ännu."
        />
      )}

      {candidates.data && candidates.data.length > 0 && (
        <ul className="list">
          {candidates.data.map((account) => (
            <li className="list-item list-item-static" key={account.id}>
              <div className="list-item-content">
                <div className="list-item-title mono">{account.username}</div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void link(account.id)}
                disabled={busyId === account.id}
              >
                {busyId === account.id ? 'Kopplar…' : 'Koppla'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

interface DetailProps {
  student: StudentSummary;
  onBack: () => void;
  onUnlink: () => void;
}

/** Elevprofil: uppgifter eleven fått av dig, uppföljning och direktmeddelande. */
const StudentDetail: React.FC<DetailProps> = ({ student, onBack, onUnlink }) => {
  const tasks = useAsync(() => listAssignedTasks({ studentId: student.id }), [student.id]);
  const [showForm, setShowForm] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const openChat = async () => {
    const result = await openDirectChannel(student.id);
    if (result.ok) setChannelId(result.data);
    else setMessageError(result.error);
  };

  const counts = countAssignedTasks(tasks.data ?? [], new Date().toISOString().slice(0, 10));

  return (
    <div className="panel-page" data-testid="student-detail">
      <SectionCard
        title={student.username}
        subtitle={`Kopplad ${formatDate(student.linkedAt.slice(0, 10))}`}
        action={
          <div className="row-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={onBack}>
              <ArrowLeft size={15} /> Tillbaka till elevlistan
            </button>
            <ConfirmButton
              label="Ta bort koppling"
              confirmLabel="Ta bort"
              question="Ta bort kopplingen?"
              onConfirm={onUnlink}
            />
          </div>
        }
      >
        <div className="grid-4">
          <StatCard label="Uppgifter" value={counts.total} />
          <StatCard label="Öppna" value={counts.open} />
          <StatCard label="Klara" value={counts.done} />
          <StatCard label="Försenade" value={counts.overdue} />
        </div>

        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        <div className="row-actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Ny uppgift till {student.username}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => void openChat()}>
            <MessageSquare size={16} /> Meddela eleven
          </button>
        </div>

        <p className="security-note">
          Elevens egen planering är privat. Här visas de uppgifter du har gett eleven,
          elevens inlämningar och de meddelanden ni skickar till varandra.
        </p>
      </SectionCard>

      {showForm && (
        <SectionCard title="Ny uppgift" subtitle={`Till ${student.username}`}>
          <AssignmentForm
            studentId={student.id}
            onCancel={() => setShowForm(false)}
            onSaved={() => {
              setShowForm(false);
              tasks.reload();
            }}
          />
        </SectionCard>
      )}

      <SectionCard title="Uppgifter" subtitle="Tilldelade av dig">
        {tasks.loading && <LoadingState label="Hämtar uppgifter…" />}
        {!tasks.loading && tasks.error && (
          <ErrorState message={tasks.error} onRetry={tasks.reload} />
        )}
        {tasks.data && tasks.data.length === 0 && (
          <EmptyState
            title="Inga uppgifter ännu"
            description="Skapa en uppgift för att eleven ska få något att arbeta med."
          />
        )}
        {tasks.data && tasks.data.length > 0 && (
          <ul className="list">
            {sortAssignedTasks(tasks.data).map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onFollowedUp={() => tasks.reload()}
                onError={setActionError}
              />
            ))}
          </ul>
        )}
      </SectionCard>

      {channelId && (
        <SectionCard title={`Meddelande till ${student.username}`} subtitle="Privat samtal">
          <MessageThread
            channelId={channelId}
            channelLabel={student.username}
            emptyText={`Inga meddelanden med ${student.username} ännu.`}
          />
        </SectionCard>
      )}
      {messageError && (
        <div className="state-note state-note-error" role="alert">
          {messageError}
        </div>
      )}

    </div>
  );
};

/** En tilldelad uppgift med status och möjlighet att markera uppföljning klar. */
export const TaskRow: React.FC<{
  task: AssignedTask;
  onFollowedUp: () => void;
  onError: (message: string) => void;
}> = ({ task, onFollowedUp, onError }) => {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(task.follow_up_note ?? '');

  const followUp = async () => {
    setBusy(true);
    const result = await markFollowUp(task.id, note);
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      onFollowedUp();
    } else {
      onError(result.error);
    }
  };

  return (
    <li className="list-item list-item-static">
      <div className="list-item-content">
        <div className="list-item-title">{task.title}</div>
        <div className="list-item-sub">
          {task.subject ? `${task.subject} · ` : ''}
          {task.due_date ? `förfaller ${formatDate(task.due_date)}` : 'inget datum'}
          {task.submitted_at ? ` · inlämnad ${formatDate(task.submitted_at.slice(0, 10))}` : ''}
        </div>
        {task.submission && (
          <div className="submission-note">Elevens svar: {task.submission}</div>
        )}
        {task.follow_up_note && (
          <div className="list-item-sub">Din anteckning: {task.follow_up_note}</div>
        )}

        {open && (
          <div className="follow-up-form" data-testid="follow-up-form">
            <label className="field-label" htmlFor={`follow-up-${task.id}`}>
              Återkoppling till eleven (frivillig)
            </label>
            <textarea
              id={`follow-up-${task.id}`}
              className="input textarea"
              rows={3}
              value={note}
              placeholder="T.ex. Bra jobbat! Tänk på att visa uträkningen nästa gång."
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Avbryt
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void followUp()}
                disabled={busy}
              >
                {busy ? 'Sparar…' : 'Markera uppföljd'}
              </button>
            </div>
          </div>
        )}
      </div>
      <TaskFiles taskId={task.id} mode="personal" />
      <TaskStagePill stage={assignmentStage(task)} />
      {task.submitted_at && !task.followed_up_at && !open && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
          Följ upp
        </button>
      )}
      {task.followed_up_at && <Pill tone="ok">Uppföljd</Pill>}
    </li>
  );
};
