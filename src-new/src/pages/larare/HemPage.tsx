import React from 'react';
import { AlertTriangle, Check, Clock, Layers, Users, X } from 'lucide-react';
import {
  JoinRequest,
  MyClass,
  MyStudent,
  countPendingRequests,
  decideClassJoinRequest,
  listClassJoinRequests,
  listMyClasses,
  listMyStudents,
} from '../../lib/classes';
import { AssignedTask, countAssignedTasks, listAssignedTasks } from '../../lib/assignments';
import { Result } from '../../lib/db';
import { formatDateTime, todayISO } from '../../lib/dates';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  StatCard,
} from '../../components/ui';
import { QuickLinks } from '../../components/QuickLinks';

interface Props {
  onNavigate: (pageId: string) => void;
}

interface HemData {
  classes: MyClass[];
  students: MyStudent[];
  requests: JoinRequest[];
  tasks: AssignedTask[];
  warnings: string[];
}

async function loadHem(): Promise<Result<HemData>> {
  const [classes, students, requests, tasks] = await Promise.all([
    listMyClasses(),
    listMyStudents(),
    listClassJoinRequests(),
    listAssignedTasks({ createdByMe: true }),
  ]);

  // Klasserna är sidans kärna — går de inte att läsa visas felet.
  if (!classes.ok) return classes;

  const warnings: string[] = [];
  if (!students.ok) warnings.push(students.error);
  if (!requests.ok) warnings.push(requests.error);
  if (!tasks.ok) warnings.push(tasks.error);

  return {
    ok: true,
    data: {
      classes: classes.data.filter((c) => c.member_role === 'larare'),
      students: students.ok ? students.data : [],
      requests: requests.ok ? requests.data : [],
      tasks: tasks.ok ? tasks.data : [],
      warnings,
    },
  };
}

/**
 * Lärarens hemsida: vad som väntar på ett beslut, vilka klasser man har och vad
 * som behöver följas upp. Siffrorna kommer från samma serverfunktioner som
 * klasserna och eleverna — aldrig från påhittad data.
 */
export const HemPage: React.FC<Props> = ({ onNavigate }) => {
  const state: AsyncState<HemData> = useAsync(loadHem);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const decide = async (requestId: string, approve: boolean) => {
    setBusyId(requestId);
    setActionError(null);
    const result = await decideClassJoinRequest(requestId, approve);
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    state.reload();
  };

  const counts = countAssignedTasks(state.data?.tasks ?? [], todayISO());
  const pending = countPendingRequests(state.data?.requests ?? []);

  return (
    <div className="panel-page" data-testid="page-larare-hem">
      <SectionCard title="Hem" subtitle="Dina klasser, dina elever och det som väntar">
        {state.loading && <LoadingState label="Hämtar din översikt…" />}
        {!state.loading && state.error && (
          <ErrorState message={state.error} onRetry={state.reload} />
        )}

        {state.data && (
          <>
            <div className="grid-4">
              <StatCard
                label="Klasser"
                value={state.data.classes.length}
                hint="Klasser där du är lärare"
              />
              <StatCard label="Elever" value={state.data.students.length} hint="I dina klasser" />
              <StatCard
                label="Klassansökningar"
                value={pending}
                hint={pending > 0 ? 'Väntar på ditt beslut' : 'Inget att göra'}
              />
              <StatCard
                label="Öppna uppgifter"
                value={counts.open}
                hint={counts.submitted > 0 ? `${counts.submitted} inlämnade` : 'Inga inlämningar'}
              />
            </div>

            {state.data.warnings.length > 0 && (
              <div className="state-note state-note-error" role="status">
                <AlertTriangle size={16} /> Vissa delar kunde inte hämtas: {state.data.warnings[0]}
              </div>
            )}
          </>
        )}
      </SectionCard>

      <SectionCard
        title="Väntar på ditt beslut"
        subtitle="Elever som angett din klasskod"
      >
        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        {state.data && pending === 0 && (
          <EmptyState
            icon={<Clock size={22} />}
            title="Inga väntande klassansökningar"
            description="Ansökningar dyker upp här när en elev använt din klasskod."
          />
        )}

        {state.data && pending > 0 && (
          <ul className="list">
            {state.data.requests
              .filter((r) => r.status === 'vantar')
              .map((request) => (
                <li className="list-item" key={request.id}>
                  <Users size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title mono">{request.student_username}</div>
                    <div className="list-item-sub">
                      {request.class_name} · {formatDateTime(request.requested_at)}
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

      <SectionCard title="Mina klasser" subtitle="Snabbt in i klassens elever och uppgifter">
        {state.data && state.data.classes.length === 0 && (
          <EmptyState
            icon={<Layers size={22} />}
            title="Du har ingen klass ännu"
            description="Skapa din första klass under Mina klasser. Du får en klasskod att dela med eleverna."
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('klasser')}
              >
                Till Mina klasser
              </button>
            }
          />
        )}

        {state.data && state.data.classes.length > 0 && (
          <ul className="list">
            {state.data.classes.map((klass) => {
              const inClass = state.data?.students.filter((s) => s.class_id === klass.id) ?? [];
              return (
                <li className="list-item list-item-static" key={klass.id}>
                  <Layers size={16} aria-hidden="true" />
                  <div className="list-item-content">
                    <div className="list-item-title">{klass.name}</div>
                    <div className="list-item-sub">{inClass.length} elever</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onNavigate('klasser')}
                  >
                    Hantera klass
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <QuickLinks
        panel="larare"
        pages={['klasser', 'elever', 'uppgifter', 'uppfoljning', 'planering']}
        onNavigate={onNavigate}
      />
    </div>
  );
};
