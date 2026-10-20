import React, { useMemo, useState } from 'react';
import { CalendarClock, Eye, Newspaper, Pencil, Plus, Send } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  listAdminPublications,
  listMemberships,
  listOrganisations,
  savePublication,
  setPublicationStatus,
} from '../../lib/api';
import { dateTime } from '../../lib/format';
import { RichTextEditor } from '../../components/RichTextEditor';
import { hasFormatting, sanitizeHtml } from '../../lib/sanitize';
import type {
  AdminPublication,
  PublicationKind,
  PublicationStatus,
  SchoolOrganisation,
} from '../../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
} from '../../components/ui';

const KIND_LABEL: Record<PublicationKind, string> = {
  nyhet: 'Nyhet',
  uppdatering: 'Kommande uppdatering',
  viktig: 'Viktig information',
};

const KIND_TONE: Record<PublicationKind, 'green' | 'blue' | 'amber'> = {
  nyhet: 'green',
  uppdatering: 'blue',
  viktig: 'amber',
};

const STATUS_LABEL: Record<PublicationStatus, string> = {
  utkast: 'Utkast',
  publicerad: 'Publicerad',
  arkiverad: 'Arkiverad',
};

const STATUS_TONE: Record<PublicationStatus, 'neutral' | 'green' | 'red'> = {
  utkast: 'neutral',
  publicerad: 'green',
  arkiverad: 'red',
};

const ROLES = ['lärare', 'elev', 'speciallärare'] as const;

/**
 * Publiceringar: nyheter, kommande uppdateringar och viktig information.
 *
 * En publicering kan sparas som utkast, publiceras direkt eller schemaläggas.
 * Målgruppen kan vara alla skolor, valda skolor, valda roller eller enskilda
 * konton. Servern avgör vem som faktiskt får se publiceringen.
 */
export const AdminPublications: React.FC = () => {
  const state = useAsync(async () => {
    const [rows, organisations, people] = await Promise.all([
      listAdminPublications(),
      listOrganisations(),
      listMemberships(),
    ]);
    return { rows, organisations, people };
  }, []);

  const [editing, setEditing] = useState<AdminPublication | 'new' | null>(null);
  const [preview, setPreview] = useState<AdminPublication | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'alla' | PublicationStatus>('alla');

  const rows = state.data?.rows ?? [];
  const organisations = state.data?.organisations ?? [];
  const people = state.data?.people ?? [];

  const visible = useMemo(
    () => rows.filter((row) => (filter === 'alla' ? true : row.status === filter)),
    [rows, filter],
  );

  const changeStatus = async (row: AdminPublication, status: PublicationStatus) => {
    setError(null);
    try {
      await setPublicationStatus(row.id, status);
      setNotice(
        status === 'publicerad'
          ? `”${row.title}” är publicerad.`
          : status === 'arkiverad'
            ? `”${row.title}” är arkiverad.`
            : `”${row.title}” är flyttad till utkast.`,
      );
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra publiceringen.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar publiceringarna…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Publiceringar" />
        <Card>
          <EmptyState
            title="Kunde inte hämta publiceringarna"
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
        title="Nyheter och uppdateringar"
        description="Publicera nyheter, kommande uppdateringar och viktig information till startsidan. Bara verkligt innehåll från databasen visas för användarna."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Ny publicering
          </Button>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="filter-bar">
        {(['alla', 'utkast', 'publicerad', 'arkiverad'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'primary' : 'ghost'}
            onClick={() => setFilter(value)}
          >
            {value === 'alla' ? 'Alla' : STATUS_LABEL[value]}
          </Button>
        ))}
      </div>

      <Card
        title="Publiceringar"
        subtitle="Utkast syns aldrig för användarna. Schemalagda publiceringar syns när tiden är inne."
        action={<Newspaper size={18} color="var(--green)" />}
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={<Newspaper size={24} />}
            title={filter === 'alla' ? 'Inga publiceringar ännu' : `Inga ${STATUS_LABEL[filter].toLowerCase()}`}
            description="Skapa en nyhet, en kommande uppdatering eller viktig information. Den visas först när du publicerar den."
            action={
              filter === 'alla' ? (
                <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>
                  Skapa publicering
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="list">
            {visible.map((row) => (
              <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="list-main">
                  <p className="list-title">{row.title}</p>
                  <p className="list-sub row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <Badge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Badge>
                    <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                    <span>
                      {row.status === 'publicerad'
                        ? `Publicerad ${dateTime(row.publish_at)}`
                        : row.status === 'utkast'
                          ? `Planerad ${dateTime(row.publish_at)}`
                          : `Uppdaterad ${dateTime(row.updated_at)}`}
                    </span>
                  </p>
                  <p className="list-sub">{audienceLabel(row, organisations)}</p>
                </div>
                <div className="list-side row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => setPreview(row)}>
                    Förhandsgranska
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing(row)}>
                    Redigera
                  </Button>
                  {row.status !== 'publicerad' && (
                    <Button size="sm" icon={<Send size={14} />} onClick={() => void changeStatus(row, 'publicerad')}>
                      Publicera
                    </Button>
                  )}
                  {row.status === 'publicerad' && (
                    <Button size="sm" variant="ghost" onClick={() => void changeStatus(row, 'utkast')}>
                      Avpublicera
                    </Button>
                  )}
                  {row.status !== 'arkiverad' && (
                    <Button size="sm" variant="ghost" onClick={() => void changeStatus(row, 'arkiverad')}>
                      Arkivera
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="notice">
        <CalendarClock size={17} />
        <span>
          Schemaläggning sker serversidigt: en publicering med framtida tid syns inte förrän
          tidpunkten har passerat. Endast publicerade publiceringar för rätt skola, roll eller konto
          visas på startsidan.
        </span>
      </div>

      {preview && (
        <Modal
          open
          wide
          title={preview.title}
          onClose={() => setPreview(null)}
          footer={<Button onClick={() => setPreview(null)}>Stäng</Button>}
        >
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <Badge tone={KIND_TONE[preview.kind]}>{KIND_LABEL[preview.kind]}</Badge>
            <Badge tone={STATUS_TONE[preview.status]}>{STATUS_LABEL[preview.status]}</Badge>
            <span className="small muted">{dateTime(preview.publish_at)}</span>
          </div>
          {preview.summary && <p className="news-summary">{preview.summary}</p>}
          {preview.body && hasFormatting(preview.body) ? (
            <div
              className="rich-text-body"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(preview.body) }}
            />
          ) : preview.body ? (
            <p style={{ whiteSpace: 'pre-wrap' }}>{preview.body}</p>
          ) : (
            <p className="small muted">Ingen längre text.</p>
          )}
          {preview.link_url && (
            <p style={{ marginBottom: 0 }}>
              <a href={preview.link_url} target="_blank" rel="noopener noreferrer">
                {preview.link_label || preview.link_url}
              </a>
            </p>
          )}
          <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
            Målgrupp: {audienceLabel(preview, organisations)}
          </p>
        </Modal>
      )}

      {editing && (
        <PublicationForm
          row={editing === 'new' ? null : editing}
          organisations={organisations}
          people={people}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Publiceringen är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

/** Kort beskrivning av målgruppen, används i listan och i förhandsgranskningen. */
export function audienceLabel(
  row: Pick<AdminPublication, 'audience_organisation_ids' | 'audience_roles' | 'audience_user_ids'>,
  organisations: SchoolOrganisation[],
): string {
  const parts: string[] = [];
  if (!row.audience_organisation_ids) parts.push('alla skolor');
  else {
    parts.push(
      row.audience_organisation_ids
        .map((id) => organisations.find((org) => org.id === id)?.name ?? 'okänd skola')
        .join(', '),
    );
  }
  if (row.audience_roles?.length) parts.push(`roller: ${row.audience_roles.join(', ')}`);
  if (row.audience_user_ids?.length) parts.push(`${row.audience_user_ids.length} enskilda konton`);
  return parts.join(' · ');
}

const PublicationForm: React.FC<{
  row: AdminPublication | null;
  organisations: SchoolOrganisation[];
  people: Array<{ user_id: string; display_name: string; username: string; organisation_name: string | null }>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ row, organisations, people, onClose, onSaved }) => {
  const [kind, setKind] = useState<PublicationKind>(row?.kind ?? 'nyhet');
  const [title, setTitle] = useState(row?.title ?? '');
  const [summary, setSummary] = useState(row?.summary ?? '');
  const [body, setBody] = useState(row?.body ?? '');
  const [linkUrl, setLinkUrl] = useState(row?.link_url ?? '');
  const [linkLabel, setLinkLabel] = useState(row?.link_label ?? '');
  // En ny publicering publiceras direkt – annars ligger den kvar som utkast och
  // når ingen, vilket är det vanligaste felet när en nyhet "inte kommer fram".
  const [status, setStatus] = useState<PublicationStatus>(row?.status ?? 'publicerad');
  const [orgIds, setOrgIds] = useState<string[]>(row?.audience_organisation_ids ?? []);
  const [roles, setRoles] = useState<string[]>(row?.audience_roles ?? []);
  const [userIds, setUserIds] = useState<string[]>(row?.audience_user_ids ?? []);
  const [allSchools, setAllSchools] = useState(!row?.audience_organisation_ids);
  const [publishAt, setPublishAt] = useState(toLocalInput(row?.publish_at ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const submit = async () => {
    if (title.trim().length < 2) {
      setError('Ge publiceringen en rubrik.');
      return;
    }
    if (!allSchools && orgIds.length === 0) {
      setError('Välj minst en skola, eller välj Alla skolor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await savePublication({
        id: row?.id ?? null,
        kind,
        title,
        summary,
        body,
        linkUrl,
        linkLabel,
        status,
        organisationIds: allSchools ? null : orgIds,
        roles: roles.length ? roles : null,
        userIds: userIds.length ? userIds : null,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publiceringen kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={row ? 'Redigera publicering' : 'Ny publicering'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}

      <div className="grid-2">
        <Field label="Typ" htmlFor="pub-kind" required>
          <select
            id="pub-kind"
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value as PublicationKind)}
          >
            <option value="nyhet">Nyhet</option>
            <option value="uppdatering">Kommande uppdatering</option>
            <option value="viktig">Viktig information</option>
          </select>
        </Field>
        <Field label="Status" htmlFor="pub-status" required>
          <select
            id="pub-status"
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value as PublicationStatus)}
          >
            <option value="utkast">Utkast</option>
            <option value="publicerad">Publicerad</option>
            <option value="arkiverad">Arkiverad</option>
          </select>
        </Field>
      </div>

      <Field label="Rubrik" htmlFor="pub-title" required>
        <input
          id="pub-title"
          className="input"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="Sammanfattning" htmlFor="pub-summary" hint="Visas i listan på startsidan.">
        <input
          id="pub-summary"
          className="input"
          value={summary}
          maxLength={400}
          onChange={(event) => setSummary(event.target.value)}
        />
      </Field>
      <RichTextEditor
        id="pub-body"
        label="Innehåll"
        hint="Formateringen följer med ut i elevernas informationsflöde."
        placeholder="Skriv nyheten eller informationen…"
        value={body}
        onChange={setBody}
      />

      <div className="grid-2">
        <Field label="Länk" htmlFor="pub-link" hint="Måste börja med http:// eller https://">
          <input
            id="pub-link"
            className="input"
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
          />
        </Field>
        <Field label="Länktext" htmlFor="pub-link-label">
          <input
            id="pub-link-label"
            className="input"
            value={linkLabel}
            onChange={(event) => setLinkLabel(event.target.value)}
          />
        </Field>
      </div>

      <Field label="Publiceringstid" htmlFor="pub-time" hint="Framtida tid = schemalagd publicering.">
        <input
          id="pub-time"
          className="input"
          type="datetime-local"
          value={publishAt}
          onChange={(event) => setPublishAt(event.target.value)}
        />
      </Field>

      <Field label="Målgrupp – skolor">
        <label className="row small" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={allSchools}
            onChange={(event) => {
              setAllSchools(event.target.checked);
              if (event.target.checked) setOrgIds([]);
            }}
          />
          Alla skolor
        </label>
        {!allSchools && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {organisations.map((org) => (
              <label key={org.id} className="row small" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={orgIds.includes(org.id)}
                  onChange={() => setOrgIds((current) => toggle(current, org.id))}
                />
                {org.name}
              </label>
            ))}
          </div>
        )}
      </Field>

      <Field label="Målgrupp – roller" hint="Lämna tomt för alla roller.">
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          {ROLES.map((role) => (
            <label key={role} className="row small" style={{ gap: 6 }}>
              <input
                type="checkbox"
                checked={roles.includes(role)}
                onChange={() => setRoles((current) => toggle(current, role))}
              />
              {role}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Målgrupp – enskilda konton" hint="Valfritt.">
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {people.slice(0, 200).map((person) => (
            <label key={person.user_id} className="row small" style={{ gap: 8, padding: '2px 0' }}>
              <input
                type="checkbox"
                checked={userIds.includes(person.user_id)}
                onChange={() => setUserIds((current) => toggle(current, person.user_id))}
              />
              {person.display_name} · @{person.username}
              {person.organisation_name ? ` · ${person.organisation_name}` : ' · ingen skola'}
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  );
};

/** datetime-local vill ha lokal tid utan tidszon. */
function toLocalInput(value: string | null): string {
  const date = value ? new Date(value) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
