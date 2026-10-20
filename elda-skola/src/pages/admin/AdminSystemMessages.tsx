import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, Search, Send, Users } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  listMemberships,
  listOrganisations,
  listSentMessages,
  sendSystemMessage,
  systemMessageAudience,
  type AudienceRow,
} from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { SentMessage } from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageIntro,
  Spinner,
  Stat,
} from '../../components/ui';

const ROLES = ['lärare', 'elev', 'speciallärare'] as const;

const ROLE_LABEL: Record<string, string> = {
  elev: 'Elever',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Systemadministratör',
  okand: 'Okänd roll',
};

const SENT_AUDIENCE: Record<string, string> = {
  klass: 'En klass',
  larare: 'Alla lärare',
  elever: 'Alla elever',
  anvandare: 'Utvalda personer',
  system: 'Systemutskick',
};

/**
 * Systemadministratörens utskick.
 *
 * Mottagarna väljs som en kombination av skolor, roller och enskilda konton.
 * Servern räknar fram mottagarlistan innan utskicket, så sammanfattningen här
 * visar exakt vilka som får meddelandet. Utskicket hamnar i mottagarens
 * "Från skolan" och är alltid skilt från privata konversationer.
 */
export const AdminSystemMessages: React.FC = () => {
  const state = useAsync(async () => {
    const [organisations, people, sent] = await Promise.all([
      listOrganisations(),
      listMemberships(),
      listSentMessages(),
    ]);
    return { organisations, people, sent };
  }, []);

  const [orgIds, setOrgIds] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AudienceRow[] | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const organisations = state.data?.organisations ?? [];
  const people = state.data?.people ?? [];
  const sent = state.data?.sent ?? [];
  const hasTarget = orgIds.length > 0 || roles.length > 0 || userIds.length > 0;

  // Förhandsgranskningen räknas av servern, så gränssnittet kan aldrig visa en
  // annan mottagarlista än den utskicket faktiskt använder.
  useEffect(() => {
    if (!hasTarget) {
      setAudience(null);
      return;
    }
    let cancelled = false;
    setPreviewBusy(true);
    setPreviewError(null);
    systemMessageAudience({ organisationIds: orgIds, roles, userIds })
      .then((rows) => {
        if (!cancelled) setAudience(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setAudience(null);
          setPreviewError(err instanceof Error ? err.message : 'Kunde inte räkna mottagare.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgIds, roles, userIds, hasTarget]);

  const candidatePeople = useMemo(() => {
    const text = query.trim().toLowerCase();
    return people
      .filter((row) => row.active)
      .filter((row) => (orgIds.length ? row.organisation_id && orgIds.includes(row.organisation_id) : true))
      .filter((row) =>
        text
          ? `${row.display_name} ${row.username} ${row.organisation_name ?? ''}`
              .toLowerCase()
              .includes(text)
          : true,
      )
      .slice(0, 80);
  }, [people, query, orgIds]);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const send = async () => {
    if (subject.trim().length < 2) {
      setError('Ge meddelandet en rubrik.');
      return;
    }
    if (body.trim().length < 2) {
      setError('Skriv ett meddelande.');
      return;
    }
    if (!hasTarget) {
      setError('Välj minst en mottagare.');
      return;
    }
    if (!audience || audience.length === 0) {
      setError('Mottagarlistan är tom. Justera urvalet.');
      return;
    }
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const count = await sendSystemMessage({
        subject,
        body,
        organisationIds: orgIds,
        roles,
        userIds,
      });
      setNotice(`Systemmeddelandet är skickat till ${count} mottagare.`);
      setSubject('');
      setBody('');
      setUserIds([]);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Meddelandet kunde inte skickas.');
    } finally {
      setSending(false);
    }
  };

  if (state.loading) return <Spinner label="Hämtar utskicken…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Systemutskick" />
        <Card>
          <EmptyState
            title="Kunde inte hämta utskicken"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Systemadministration"
        title="Systemutskick"
        description="Skicka viktig information, driftmeddelanden eller annan information till hela systemet eller valda målgrupper. Utskicket är skilt från vanliga privata meddelanden."
        actions={<Megaphone size={20} color="var(--green)" />}
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid-4">
        <Stat label="Skolor" value={organisations.length} />
        <Stat label="Konton" value={people.length} />
        <Stat label="Valda skolor" value={orgIds.length} />
        <Stat
          label="Mottagare"
          value={audience?.length ?? '—'}
          tone={audience && audience.length > 0 ? 'green' : 'neutral'}
          hint={previewBusy ? 'Räknar…' : undefined}
        />
      </div>

      <Card
        title="Välj målgrupp"
        subtitle="Kombinera skolor, roller och enskilda konton. Mottagarlistan räknas fram av servern."
        action={<Users size={18} color="var(--green)" />}
      >
        <Field label="Skolor" hint="Ingen vald skola = alla skolor (i kombination med roll).">
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {organisations.length === 0 ? (
              <p className="small muted" style={{ margin: 0 }}>
                Inga skolor är skapade ännu.
              </p>
            ) : (
              organisations.map((row) => (
                <label key={row.id} className="row small" style={{ gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={orgIds.includes(row.id)}
                    onChange={() => setOrgIds((current) => toggle(current, row.id))}
                  />
                  {row.name}
                  {row.active ? '' : ' (inaktiv)'}
                </label>
              ))
            )}
          </div>
        </Field>

        <Field label="Roller" hint="Lämna tomt för alla roller.">
          <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
            {ROLES.map((role) => (
              <label key={role} className="row small" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  onChange={() => setRoles((current) => toggle(current, role))}
                />
                {ROLE_LABEL[role]}
              </label>
            ))}
          </div>
        </Field>

        <Field
          label="Enskilda konton"
          htmlFor="sys-people"
          hint="Valfritt. Sök bland kontona i de valda skolorna."
        >
          <div id="sys-people">
            <div className="search-field" style={{ marginBottom: 8 }}>
              <Search size={16} aria-hidden />
              <input
                className="input"
                placeholder="Sök namn eller användarnamn"
                aria-label="Sök mottagare"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {candidatePeople.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>
                  Inga konton matchar urvalet.
                </p>
              ) : (
                candidatePeople.map((row) => (
                  <label key={row.user_id} className="row small" style={{ gap: 8, padding: '2px 0' }}>
                    <input
                      type="checkbox"
                      checked={userIds.includes(row.user_id)}
                      onChange={() => setUserIds((current) => toggle(current, row.user_id))}
                    />
                    {row.display_name} · @{row.username} · {ROLE_LABEL[row.role] ?? row.role}
                    {row.organisation_name ? ` · ${row.organisation_name}` : ' · ingen skola'}
                  </label>
                ))
              )}
            </div>
          </div>
        </Field>
      </Card>

      <Card title="Sammanfattning innan utskick" subtitle="Exakt vilka som får meddelandet.">
        {previewError && <Alert>{previewError}</Alert>}
        {!hasTarget ? (
          <EmptyState
            icon={<Users size={22} />}
            title="Ingen målgrupp vald"
            description="Välj minst en skola, roll eller ett enskilt konto för att se mottagarna."
          />
        ) : previewBusy && !audience ? (
          <Spinner label="Räknar mottagare…" />
        ) : !audience || audience.length === 0 ? (
          <Alert tone="info">
            Urvalet ger inga mottagare. Kontrollera att kontona är aktiva och kopplade till rätt
            skola.
          </Alert>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{audience.length}</strong> mottagare: {summaryOf(audience)}
            </p>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {audience.map((row) => (
                <div key={row.user_id} className="list-row" style={{ padding: '6px 0' }}>
                  <div className="list-main">
                    <p className="list-title" style={{ margin: 0 }}>
                      {row.display_name}
                    </p>
                    <p className="list-sub" style={{ margin: 0 }}>
                      @{row.username} · {ROLE_LABEL[row.role] ?? row.role} · {row.organisation_name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card title="Meddelandet" subtitle="Rubrik och text. Ingen e-post skickas.">
        <Field label="Rubrik" htmlFor="sys-subject" required>
          <input
            id="sys-subject"
            className="input"
            value={subject}
            maxLength={200}
            onChange={(event) => setSubject(event.target.value)}
          />
        </Field>
        <Field label="Meddelande" htmlFor="sys-body" required>
          <textarea
            id="sys-body"
            className="input"
            rows={6}
            maxLength={8000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div className="row-between">
          <span className="small muted">
            Utskicket syns under ”Från skolan” hos mottagaren och kan inte ändras efteråt.
          </span>
          <Button
            icon={<Send size={15} />}
            loading={sending}
            disabled={!hasTarget}
            onClick={() => void send()}
          >
            Skicka systemmeddelande
          </Button>
        </div>
      </Card>

      <Card title="Skickade utskick" subtitle="Uppföljning av mottagare och lässtatus.">
        {sent.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={22} />}
            title="Inga utskick ännu"
            description="Dina skickade systemmeddelanden visas här med mottagar- och läsantal."
          />
        ) : (
          <div className="list">
            {sent.map((row) => (
              <SentRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const SentRow: React.FC<{ row: SentMessage }> = ({ row }) => (
  <div className="list-row">
    <div className="list-main">
      <p className="list-title">{row.subject}</p>
      <p className="list-sub">
        {SENT_AUDIENCE[row.audience] ?? row.audience}
        {row.class_name ? ` · ${row.class_name}` : ''} · {dateTime(row.created_at)}
      </p>
    </div>
    <div className="list-side row" style={{ gap: 6 }}>
      <Badge tone="neutral">{row.recipient_count} mottagare</Badge>
      <Badge tone={row.read_count > 0 ? 'green' : 'amber'}>
        {row.read_count} lästa
      </Badge>
    </div>
  </div>
);

function summaryOf(rows: AudienceRow[]): string {
  const byOrg = new Map<string, number>();
  for (const row of rows) {
    byOrg.set(row.organisation_name, (byOrg.get(row.organisation_name) ?? 0) + 1);
  }
  return [...byOrg.entries()]
    .map(([name, count]) => `${count} i ${name}`)
    .join(', ');
}
