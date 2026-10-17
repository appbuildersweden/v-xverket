import React, { useState } from 'react';
import { GraduationCap, KeyRound, Send, ShieldCheck, Users } from 'lucide-react';
import {
  CLASS_CODE_RE,
  ClassInfo,
  ClassMember,
  classmates,
  classTeachers,
  listClassMembers,
  listClasses,
  normalizeClassCode,
  requestClassJoin,
} from '../../lib/classes';
import { isPrivateStudent } from '../../lib/auth-types';
import { useAuth } from '../../lib/AuthContext';
import { AsyncState, useAsync } from '../../lib/useAsync';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  SectionCard,
} from '../../components/ui';

/**
 * Min klass. Eleven ser bara sin egen klass och sina egna klasskamrater — det
 * styrs av medlemskapet i databasen, inte av den här vyn. Inga kontaktuppgifter
 * eller privata uppgifter visas, bara användarnamn.
 */
export const KlassPage: React.FC = () => {
  const { user } = useAuth();
  const classes = useAsync(listClasses);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mine = (classes.data ?? []).filter((c) => c.member_role === 'elev');
  const selected: ClassInfo | undefined =
    mine.find((c) => c.id === selectedId) ?? mine[0];
  const privateStudent = isPrivateStudent(user);

  return (
    <div className="panel-page" data-testid="page-elev-klass">
      {user?.role === 'elev' && user.limited !== true && (
        <JoinClassCard
          isPrivate={privateStudent}
          alreadyInClass={mine.length > 0}
          onJoined={classes.reload}
        />
      )}

      {privateStudent && mine.length === 0 && (
        <SectionCard
          title="Du har ett privat konto"
          subtitle="Personliga studieverktyg — ingen klass"
        >
          <p className="card-sub">
            Dina ämnen, uppgifter, flashcards, provträning, dokument och AI-studiehjälp fungerar
            precis som vanligt. Klasschatt och klassens innehåll visas först när en lärare har
            godkänt din ansökan om att gå med i klassen. Du behöver aldrig skapa ett nytt konto för
            det — samma konto ansluts till klassen.
          </p>
        </SectionCard>
      )}

      <SectionCard title="Min klass" subtitle="Klassen du går i">
        {classes.loading && <LoadingState label="Hämtar din klass…" />}
        {!classes.loading && classes.error && (
          <ErrorState message={classes.error} onRetry={classes.reload} />
        )}

        {classes.data && mine.length === 0 && (
          <EmptyState
            icon={<GraduationCap size={22} />}
            title="Du är inte med i någon klass ännu"
            description="Har du fått en klasskod av din lärare? Ange den ovan och skicka en ansökan. Din lärare godkänner den innan du ser klassens innehåll."
          />
        )}

        {mine.length > 1 && (
          <div className="row-actions">
            {mine.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${selected?.id === c.id ? 'chip-active' : ''}`}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="detail-list">
            <div>
              <dt>Klass</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Elever</dt>
              <dd>{selected.memberCount}</dd>
            </div>
            <div>
              <dt>Din roll</dt>
              <dd>
                <Pill tone="info">Elev</Pill>
              </dd>
            </div>
          </div>
        )}
      </SectionCard>

      {selected && <ClassMembers classInfo={selected} meId={user?.id ?? null} />}
    </div>
  );
};

/**
 * Ansökan om att gå med i en klass med hjälp av en klasskod.
 *
 * Koden ger aldrig åtkomst i sig: den skapar en förfrågan hos klassens lärare,
 * och först ett godkänt medlemskap ger klassens innehåll. Koden kan därför inte
 * användas för att läsa klassdata ens om den läcker.
 */
const JoinClassCard: React.FC<{
  isPrivate: boolean;
  alreadyInClass: boolean;
  onJoined: () => void;
}> = ({ isPrivate, alreadyInClass, onJoined }) => {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeClassCode(code);
    if (!CLASS_CODE_RE.test(normalized)) {
      setError('Klasskoden är sex tecken, till exempel ABC234.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await requestClassJoin(normalized);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage(result.data.message);
    setCode('');
    onJoined();
  };

  return (
    <SectionCard
      title={alreadyInClass ? 'Gå med i fler klasser' : 'Gå med i en klass'}
      subtitle="Ange klasskoden du har fått av din lärare"
    >
      <form className="form" onSubmit={(e) => void submit(e)} data-testid="class-code-form">
        <div className="field">
          <label className="field-label" htmlFor="class-code">
            Klasskod
          </label>
          <input
            id="class-code"
            className="input mono"
            type="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABC234"
            disabled={busy}
          />
          <p className="field-hint">
            {isPrivate
              ? 'Ditt privata konto ansluts till klassen — du behöver inte skapa ett nytt konto.'
              : 'Koden skickar en ansökan. Din lärare måste godkänna den innan du ser klassens innehåll.'}
          </p>
        </div>

        {message && (
          <div className="state-note" role="status" data-testid="class-code-message">
            <ShieldCheck size={15} /> {message}
          </div>
        )}
        {error && (
          <div className="state-note state-note-error" role="alert">
            {error}
          </div>
        )}

        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? (
              'Skickar…'
            ) : (
              <>
                <Send size={15} /> <KeyRound size={15} /> Skicka ansökan
              </>
            )}
          </button>
        </div>
      </form>
    </SectionCard>
  );
};

const ClassMembers: React.FC<{ classInfo: ClassInfo; meId: string | null }> = ({
  classInfo,
  meId,
}) => {
  const members: AsyncState<ClassMember[]> = useAsync(
    () => listClassMembers(classInfo.id),
    [classInfo.id],
  );

  return (
    <>
      <SectionCard title="Klasskamrater" subtitle={classInfo.name}>
        {members.loading && <LoadingState label="Hämtar klasskamrater…" />}
        {!members.loading && members.error && (
          <ErrorState message={members.error} onRetry={members.reload} />
        )}

        {members.data && classmates(members.data, meId).length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga klasskamrater ännu"
            description="När fler elever läggs till i klassen visas de här."
          />
        )}

        {members.data && classmates(members.data, meId).length > 0 && (
          <ul className="list">
            {classmates(members.data, meId).map((member) => (
              <li className="list-item list-item-static" key={member.user_id}>
                <Users size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{member.username}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {members.data && classTeachers(members.data).length > 0 && (
        <SectionCard title="Lärare i klassen" subtitle="Personal kopplad till klassen">
          <ul className="list">
            {classTeachers(members.data).map((member) => (
              <li className="list-item list-item-static" key={member.user_id}>
                <GraduationCap size={16} aria-hidden="true" />
                <div className="list-item-content">
                  <div className="list-item-title mono">{member.username}</div>
                  <div className="list-item-sub">
                    {member.role === 'speciallärare' ? 'Speciallärare' : 'Personal'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  );
};
