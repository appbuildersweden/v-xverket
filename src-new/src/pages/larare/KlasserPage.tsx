import React, { useState } from 'react';
import { Check, Copy, KeyRound, Layers, RefreshCw, Users, X } from 'lucide-react';
import {
  JoinRequest,
  MyClass,
  MyStudent,
  createClassWithCode,
  decideClassJoinRequest,
  listClassJoinRequests,
  listMyClasses,
  listMyStudents,
  removeClassStudent,
  rotateClassCode,
} from '../../lib/classes';
import { Result } from '../../lib/db';
import { formatDateTime } from '../../lib/dates';
import { useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PartialDataNotice,
  Pill,
  SectionCard,
} from '../../components/ui';
import { ConfirmButton, TextAreaField, TextField } from '../../components/forms';

interface Data {
  classes: MyClass[];
  requests: JoinRequest[];
  students: MyStudent[];
  /** Delar som inte kunde hämtas utan att hela sidan faller. */
  warnings: string[];
}

async function loadClasses(): Promise<Result<Data>> {
  const [classes, requests, students] = await Promise.all([
    listMyClasses(),
    listClassJoinRequests(),
    listMyStudents(),
  ]);

  if (!classes.ok) return classes;

  // Namnen på det som inte gick att hämta — listan får aldrig se tom ut i stället.
  const warnings: string[] = [];
  if (!requests.ok) warnings.push('klassansökningarna');
  if (!students.ok) warnings.push('eleverna');

  return {
    ok: true,
    data: {
      classes: classes.data.filter((c) => c.member_role === 'larare'),
      requests: requests.ok ? requests.data : [],
      students: students.ok ? students.data : [],
      warnings,
    },
  };
}

/**
 * Mina klasser.
 *
 * Läraren ser bara sina egna klasser: klasslistan kommer från `list_my_classes`
 * (där man är medlem) och eleverna från `list_my_students`, som bara returnerar
 * elever i klasser där anroparen själv är lärare. Klasskoden skapar aldrig
 * åtkomst i sig — den skickar bara en ansökan som läraren godkänner här.
 */
export const KlasserPage: React.FC = () => {
  const data = useAsync(loadClasses);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const decide = async (requestId: string, approve: boolean) => {
    setBusyId(requestId);
    setActionError(null);
    const result = await decideClassJoinRequest(requestId, approve);
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    data.reload();
  };

  return (
    <div className="panel-page" data-testid="page-larare-klasser">
      <NewClassCard onCreated={data.reload} />

      <SectionCard
        title="Klassansökningar"
        subtitle="Elever som angett din klasskod och väntar på ditt beslut"
        action={
          <button type="button" className="btn btn-outline btn-sm" onClick={data.reload}>
            <RefreshCw size={15} /> Uppdatera
          </button>
        }
      >
        {data.loading && <LoadingState label="Hämtar klassansökningar…" />}
        {/* En misslyckad delladdning får inte se ut som en tom lista. */}
        {data.data && <PartialDataNotice missing={data.data.warnings} onRetry={data.reload} />}
        {!data.loading && data.error && (
          <ErrorState message={data.error} onRetry={data.reload} />
        )}
        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        {data.data && data.data.requests.filter((r) => r.status === 'vantar').length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga väntande ansökningar"
            description="När en elev använder din klasskod hamnar ansökan här. Först när du godkänner den ser eleven klassens innehåll."
          />
        )}

        {data.data && data.data.requests.filter((r) => r.status === 'vantar').length > 0 && (
          <ul className="list">
            {data.data.requests
              .filter((r) => r.status === 'vantar')
              .map((request) => (
                <li className="list-item" key={request.id}>
                  <Users size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title mono">{request.student_username}</div>
                    <div className="list-item-sub">
                      {request.class_name} · ansökte {formatDateTime(request.requested_at)}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busyId === request.id}
                      onClick={() => void decide(request.id, true)}
                    >
                      <Check size={15} /> Godkänn
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId === request.id}
                      onClick={() => void decide(request.id, false)}
                    >
                      <X size={15} /> Neka
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Mina klasser" subtitle="Klasser där du är lärare">
        {data.loading && <LoadingState label="Hämtar dina klasser…" />}
        {data.data && data.data.classes.length === 0 && (
          <EmptyState
            icon={<Layers size={22} />}
            title="Du har ingen klass ännu"
            description="Skapa en klass ovan. Du får då en klasskod att dela med dina elever."
          />
        )}

        {data.data && data.data.classes.length > 0 && (
          <ul className="list">
            {data.data.classes.map((klass) => (
              <ClassRow
                key={klass.id}
                klass={klass}
                students={data.data?.students.filter((s) => s.class_id === klass.id) ?? []}
                onChanged={data.reload}
                onError={setActionError}
              />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};

const NewClassCard: React.FC<{ onCreated: () => void }> = ({ onCreated }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Ge klassen ett namn (minst 2 tecken).');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createClassWithCode(name, description);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCreated({ name: result.data.name, code: result.data.join_code });
    setName('');
    setDescription('');
    setOpen(false);
    onCreated();
  };

  return (
    <SectionCard
      title="Skapa klass"
      subtitle="Klassen får en egen klasskod som bara ger en ansökan — du godkänner den"
      action={
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Stäng' : 'Ny klass'}
        </button>
      }
    >
      {created && (
        <div className="state-note" role="status" data-testid="new-class-code">
          Klassen <strong>{created.name}</strong> är skapad. Klasskoden är{' '}
          <span className="mono">{created.code}</span> — dela den med dina elever.
        </div>
      )}

      {open && (
        <form className="form" onSubmit={(e) => void submit(e)}>
          <TextField
            label="Klassens namn"
            value={name}
            onChange={setName}
            placeholder="T.ex. 8B matematik"
            maxLength={80}
            required
          />
          <TextAreaField
            label="Beskrivning"
            value={description}
            onChange={setDescription}
            placeholder="Frivillig kort beskrivning av klassen"
            rows={2}
            maxLength={500}
          />
          {error && (
            <p className="field-hint field-hint-error" role="alert">
              {error}
            </p>
          )}
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Skapar…' : 'Skapa klass'}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
};

const ClassRow: React.FC<{
  klass: MyClass;
  students: MyStudent[];
  onChanged: () => void;
  onError: (message: string) => void;
}> = ({ klass, students, onChanged, onError }) => {
  const [code, setCode] = useState(klass.join_code);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const rotate = async () => {
    setBusy(true);
    const result = await rotateClassCode(klass.id);
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setCode(result.data);
  };

  const remove = async (studentId: string) => {
    setBusy(true);
    const result = await removeClassStudent(klass.id, studentId);
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onChanged();
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Urklipp kan vara blockerat — koden syns ändå i klartext.
    }
  };

  return (
    <li className="list-item list-item-static">
      <Layers size={16} aria-hidden="true" />
      <div className="list-item-content">
        <div className="list-item-title">{klass.name}</div>
        <div className="list-item-sub">
          {klass.member_count} medlemmar · {students.length} elever
        </div>
        {code && (
          <div className="list-item-sub">
            Klasskod: <span className="mono">{code}</span>{' '}
            <Pill tone="info">
              <KeyRound size={12} /> Dela med eleverna
            </Pill>
          </div>
        )}
      </div>
      <div className="row-actions">
        {code && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void copy()}>
            <Copy size={15} /> {copied ? 'Kopierad' : 'Kopiera kod'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => void rotate()}
        >
          <RefreshCw size={15} /> Ny kod
        </button>
      </div>

      {students.length > 0 && (
        <ul className="list list-nested">
          {students.map((student) => (
            <li className="list-item" key={`${klass.id}:${student.id}`}>
              <Users size={15} aria-hidden="true" />
              <div className="list-item-content">
                <div className="list-item-title mono">{student.username}</div>
                <div className="list-item-sub">
                  {student.account_type === 'privat' ? 'Privat elev' : 'Skolelev'}
                </div>
              </div>
              <ConfirmButton
                label="Ta bort"
                confirmLabel="Bekräfta"
                question={`Ta bort ${student.username} ur ${klass.name}?`}
                busy={busy}
                onConfirm={() => void remove(student.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};
