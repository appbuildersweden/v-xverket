import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Check,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Power,
  Users,
} from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  assignMembership,
  listAdminClassMembers,
  listAdminClasses,
  listMemberships,
  listOrganisations,
  saveOrganisation,
  setOrganisationActive,
} from '../../lib/api';
import { shortDate } from '../../lib/format';
import type {
  AdminClass,
  AdminClassMember,
  AdminMembership,
  SchoolOrganisation,
} from '../../lib/types';
import { MunicipalityPicker } from '../../components/MunicipalityPicker';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  SearchField,
  Segmented,
  Spinner,
  Stat,
} from '../../components/ui';

const ROLE_LABEL: Record<string, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Systemadministratör',
  okand: 'Okänd roll',
};

const PAGE_SIZE = 12;

const ACCOUNT_FILTERS = [
  { id: 'alla', label: 'Alla konton' },
  { id: 'utan', label: 'Utan skola' },
  { id: 'elev', label: 'Elever' },
  { id: 'lärare', label: 'Lärare' },
  { id: 'speciallärare', label: 'Speciallärare' },
  { id: 'admin', label: 'Admin' },
];

type DetailTab = 'oversikt' | 'medlemmar' | 'klasser' | 'installningar';

/** Gör ett kortnamn av skolans namn. Används bara som förslag i formuläret. */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Kort etikett för en skolas status. */
const StatusBadge: React.FC<{ active: boolean }> = ({ active }) =>
  active ? <Badge tone="green">Aktiv</Badge> : <Badge tone="red">Inaktiverad</Badge>;

/**
 * Skolor och medlemskap.
 *
 * Sidan är sökbaserad: ingen skola listas förrän administratören söker, och
 * detaljerna visas först när en skola har valts. Kontona ligger i en kompakt
 * tabell med sökning, filter och sidnumrering i stället för en lång kolumn med
 * skolval under varje konto – kopplingen ändras i en egen dialog.
 */
export const AdminOrganisations: React.FC = () => {
  const state = useAsync(async () => {
    const [organisations, people, classes, classMembers] = await Promise.all([
      listOrganisations(),
      listMemberships(),
      listAdminClasses(),
      listAdminClassMembers(),
    ]);
    return { organisations, people, classes, classMembers };
  }, []);

  const organisations = state.data?.organisations ?? [];
  const people = state.data?.people ?? [];
  const classes = state.data?.classes ?? [];
  const classMembers = state.data?.classMembers ?? [];

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>('oversikt');
  const [editing, setEditing] = useState<SchoolOrganisation | 'new' | null>(null);
  const [membershipFor, setMembershipFor] = useState<AdminMembership | null>(null);
  const [confirming, setConfirming] = useState<SchoolOrganisation | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [accountQuery, setAccountQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('alla');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [accountQuery, accountFilter]);

  const selected = organisations.find((row) => row.id === selectedId) ?? null;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return organisations.filter((row) =>
      `${row.name} ${row.municipality ?? ''} ${row.slug} ${row.contact_email ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [organisations, query]);

  const unlinked = people.filter((row) => !row.organisation_id).length;
  const activeSchools = organisations.filter((row) => row.active).length;

  const accounts = useMemo(() => {
    const needle = accountQuery.trim().toLowerCase();
    return people
      .filter((row) => {
        if (accountFilter === 'utan') return !row.organisation_id;
        if (accountFilter === 'alla') return true;
        return row.role === accountFilter;
      })
      .filter((row) =>
        needle
          ? `${row.display_name} ${row.username} ${row.organisation_name ?? ''}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .slice()
      .sort((a, b) => a.display_name.localeCompare(b.display_name, 'sv'));
  }, [people, accountQuery, accountFilter]);

  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = accounts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const reload = async () => {
    await state.reload();
  };

  const toggleActive = async (row: SchoolOrganisation) => {
    setError(null);
    try {
      await setOrganisationActive(row.id, !row.active);
      setNotice(
        row.active
          ? `”${row.name}” är inaktiverad. All data finns kvar och kontona behåller sin koppling.`
          : `”${row.name}” är aktiverad igen.`,
      );
      setConfirming(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra skolans status.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar skolorna…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Skolor och medlemskap" />
        <Card>
          <EmptyState
            title="Kunde inte hämta skolorna"
            description={state.error}
            action={<Button onClick={() => void reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow="Systemadministration"
        title="Skolor och medlemskap"
        description="En skolorganisation per skola. Koppla elever, lärare och speciallärare till rätt skola – kommunikation och data hålls separerade mellan skolorna."
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="stat-strip">
        <Stat label="Skolor" value={organisations.length} />
        <Stat label="Aktiva skolor" value={activeSchools} tone="green" />
        <Stat label="Konton" value={people.length} />
        <Stat label="Klasser" value={organisations.reduce((sum, row) => sum + row.classes, 0)} />
        <Stat
          label="Utan skola"
          value={unlinked}
          tone={unlinked > 0 ? 'amber' : 'neutral'}
          hint={unlinked > 0 ? 'Kan inte använda interna meddelanden' : 'Alla är kopplade'}
        />
      </div>

      <Card
        title="Skolor"
        subtitle="Sök fram skolan du vill hantera. Skolan visas med sin översikt, medlemmar, klasser och inställningar."
        action={<Building2 size={18} color="var(--green)" />}
      >
        {selected ? (
          <SchoolDetail
            organisation={selected}
            people={people}
            classes={classes}
            classMembers={classMembers}
            tab={tab}
            onTab={setTab}
            onBack={() => {
              setSelectedId(null);
              setTab('oversikt');
            }}
            onEdit={() => setEditing(selected)}
            onToggle={() => setConfirming(selected)}
            onChangeMembership={setMembershipFor}
          />
        ) : (
          <>
            <div className="toolbar">
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Sök efter skola, kommun eller kortnamn…"
                ariaLabel="Sök skola"
              />
              <div className="toolbar-actions">
                <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
                  Skapa skola
                </Button>
              </div>
            </div>

            {query.trim() === '' ? (
              <EmptyState
                icon={<Search size={24} />}
                title="Sök efter en skola"
                description="Sök efter en skola för att visa och hantera dess information."
                action={
                  organisations.length === 0 ? (
                    <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>
                      Skapa den första skolan
                    </Button>
                  ) : undefined
                }
              />
            ) : results.length === 0 ? (
              <EmptyState
                icon={<Search size={24} />}
                title="Inga skolor matchar sökningen"
                description="Prova ett annat skolnamn, en annan kommun eller skolans kortnamn."
              />
            ) : (
              <div className="org-grid">
                {results.map((row) => (
                  <SchoolCard
                    key={row.id}
                    row={row}
                    onOpen={() => {
                      setSelectedId(row.id);
                      setTab('oversikt');
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <Card
        title="Konton och skolkoppling"
        subtitle="Ett konto har högst en aktiv skola. Ett byte avslutar den gamla kopplingen och åtkomsten till den gamla skolans privata meddelanden upphör."
        action={<Users size={18} color="var(--green)" />}
      >
        {unlinked > 0 && (
          <Alert tone="info">
            {unlinked} {unlinked === 1 ? 'konto saknar' : 'konton saknar'} skola. De kan logga in men
            kan inte använda vanliga interna skolmeddelanden förrän du kopplar dem till en skola.
          </Alert>
        )}

        <div className="toolbar">
          <SearchField
            value={accountQuery}
            onChange={setAccountQuery}
            placeholder="Sök namn, användarnamn eller skola…"
            ariaLabel="Sök konton"
          />
          <div className="chip-row" role="group" aria-label="Filtrera konton">
            {ACCOUNT_FILTERS.map((filter) => {
              const count =
                filter.id === 'alla'
                  ? people.length
                  : filter.id === 'utan'
                    ? unlinked
                    : people.filter((row) => row.role === filter.id).length;
              return (
                <button
                  key={filter.id}
                  type="button"
                  className={`chip ${accountFilter === filter.id ? 'chip-active' : ''}`}
                  aria-pressed={accountFilter === filter.id}
                  onClick={() => setAccountFilter(filter.id)}
                >
                  {filter.label}
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {accounts.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga konton matchar"
            description="Prova ett annat sökord eller ett annat filter."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-compact stacked-table">
                <thead>
                  <tr>
                    <th scope="col">Konto</th>
                    <th scope="col">Roll</th>
                    <th scope="col">Skola</th>
                    <th scope="col">Status</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Åtgärd
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.user_id}>
                      <td data-label="Konto">
                        <span className="account-cell">
                          <Avatar name={row.display_name} size={30} />
                          <span>
                            <span className="account-name">{row.display_name}</span>
                            <span className="account-user">@{row.username}</span>
                          </span>
                        </span>
                      </td>
                      <td data-label="Roll">{ROLE_LABEL[row.role] ?? row.role}</td>
                      <td data-label="Skola">
                        {row.organisation_name ? (
                          row.organisation_name
                        ) : (
                          <span className="muted">Ingen skola</span>
                        )}
                      </td>
                      <td data-label="Status">
                        {row.active ? (
                          <Badge tone="green">Aktiv</Badge>
                        ) : (
                          <Badge tone="red">Inaktiv</Badge>
                        )}
                      </td>
                      <td data-label="Åtgärd" className="table-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setMembershipFor(row)}
                          aria-label={`Ändra skolkoppling för ${row.display_name}`}
                        >
                          Ändra skolkoppling
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={currentPage} total={totalPages} onChange={setPage} shown={pageRows.length} all={accounts.length} />
          </>
        )}
      </Card>

      <div style={{ height: 16 }} />

      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          Systemadministratören är den enda administrativa nivån. Roller och skolkopplingar
          kontrolleras på serversidan och kan inte ändras från klienten.
        </span>
      </div>

      {editing && (
        <OrganisationForm
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            setNotice('Skolan är sparad.');
            if (saved && typeof saved === 'string') setSelectedId(saved);
            await reload();
          }}
        />
      )}

      {membershipFor && (
        <MembershipDialog
          row={membershipFor}
          organisations={organisations}
          onClose={() => setMembershipFor(null)}
          onSaved={async () => {
            setMembershipFor(null);
            setNotice('Skolkopplingen är sparad.');
            await reload();
          }}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title={confirming.active ? 'Inaktivera skolan?' : 'Aktivera skolan?'}
          description={
            confirming.active
              ? `”${confirming.name}” stängs för ny kommunikation. All data, alla konton och alla klasser finns kvar och kan aktiveras igen.`
              : `”${confirming.name}” öppnas igen för kommunikation.`
          }
          confirmLabel={confirming.active ? 'Inaktivera' : 'Aktivera'}
          onClose={() => setConfirming(null)}
          onConfirm={() => void toggleActive(confirming)}
        />
      )}
    </div>
  );
};

/** Kompakt sökträff. Alla detaljer visas först när skolan öppnas. */
const SchoolCard: React.FC<{ row: SchoolOrganisation; onOpen: () => void }> = ({ row, onOpen }) => (
  <div className="org-card">
    <div className="org-card-head">
      <div>
        <h3 className="org-name">{row.name}</h3>
        <p className="org-meta">{row.municipality ?? 'Kommun saknas'}</p>
      </div>
      <StatusBadge active={row.active} />
    </div>
    <p className="org-figures">
      <span>
        <b>{row.students}</b> elever
      </span>
      <span>
        <b>{row.teachers}</b> lärare
      </span>
      <span>
        <b>{row.special_teachers}</b> speciallärare
      </span>
      <span>
        <b>{row.classes}</b> klasser
      </span>
    </p>
    <div className="org-card-foot">
      <code className="small muted">{row.slug}</code>
      <Button size="sm" variant="secondary" onClick={onOpen}>
        Hantera
      </Button>
    </div>
  </div>
);

const SchoolDetail: React.FC<{
  organisation: SchoolOrganisation;
  people: AdminMembership[];
  classes: AdminClass[];
  classMembers: AdminClassMember[];
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onBack: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onChangeMembership: (row: AdminMembership) => void;
}> = ({
  organisation,
  people,
  classes,
  classMembers,
  tab,
  onTab,
  onBack,
  onEdit,
  onToggle,
  onChangeMembership,
}) => {
  const [memberQuery, setMemberQuery] = useState('');

  const members = useMemo(
    () =>
      people
        .filter((row) => row.organisation_id === organisation.id)
        .filter((row) => {
          const needle = memberQuery.trim().toLowerCase();
          if (!needle) return true;
          return `${row.display_name} ${row.username}`.toLowerCase().includes(needle);
        })
        .sort((a, b) => a.display_name.localeCompare(b.display_name, 'sv')),
    [people, organisation.id, memberQuery],
  );

  // Klassen räknas till skolan om minst en av dess medlemmar är kopplad dit.
  const schoolClassIds = useMemo(() => {
    const memberIds = new Set(
      people.filter((row) => row.organisation_id === organisation.id).map((row) => row.user_id),
    );
    return new Set(
      classMembers.filter((row) => memberIds.has(row.user_id)).map((row) => row.class_id),
    );
  }, [people, classMembers, organisation.id]);

  const schoolClasses = classes.filter((row) => schoolClassIds.has(row.id));

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 2 }}>
            <h2>{organisation.name}</h2>
            <StatusBadge active={organisation.active} />
          </div>
          <p>
            {organisation.municipality ?? 'Kommun saknas'} · <code>{organisation.slug}</code> ·{' '}
            {organisation.members} konton
          </p>
        </div>
        <div className="panel-actions">
          <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack}>
            Tillbaka
          </Button>
          <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={onEdit}>
            Redigera
          </Button>
          <Button
            size="sm"
            variant={organisation.active ? 'danger' : 'secondary'}
            icon={<Power size={14} />}
            onClick={onToggle}
          >
            {organisation.active ? 'Inaktivera' : 'Aktivera'}
          </Button>
        </div>
      </div>

      <div className="panel-body">
        <Segmented
          options={[
            { id: 'oversikt', label: 'Översikt' },
            { id: 'medlemmar', label: 'Medlemmar', count: organisation.members },
            { id: 'klasser', label: 'Klasser', count: organisation.classes },
            { id: 'installningar', label: 'Inställningar' },
          ]}
          value={tab}
          onChange={(id) => onTab(id as DetailTab)}
          ariaLabel="Skolans sektioner"
        />

        <div style={{ marginTop: 16 }}>
          {tab === 'oversikt' && (
            <>
              <div className="detail-grid">
                <dl className="kv">
                  <dt>Skola</dt>
                  <dd>{organisation.name}</dd>
                </dl>
                <dl className="kv">
                  <dt>Kommun</dt>
                  <dd>{organisation.municipality ?? 'Saknas'}</dd>
                </dl>
                <dl className="kv">
                  <dt>Status</dt>
                  <dd>{organisation.active ? 'Aktiv' : 'Inaktiverad'}</dd>
                </dl>
                <dl className="kv">
                  <dt>Kortnamn</dt>
                  <dd>
                    <code>{organisation.slug}</code>
                  </dd>
                </dl>
                <dl className="kv">
                  <dt>Kontaktadress</dt>
                  <dd>{organisation.contact_email ?? 'Saknas'}</dd>
                </dl>
                <dl className="kv">
                  <dt>Skapad</dt>
                  <dd>{shortDate(organisation.created_at)}</dd>
                </dl>
              </div>

              <div className="stat-strip" style={{ marginTop: 14, marginBottom: 0 }}>
                <Stat label="Elever" value={organisation.students} />
                <Stat label="Lärare" value={organisation.teachers} />
                <Stat label="Speciallärare" value={organisation.special_teachers} />
                <Stat label="Klasser" value={organisation.classes} />
              </div>
            </>
          )}

          {tab === 'medlemmar' && (
            <>
              <div className="toolbar">
                <SearchField
                  value={memberQuery}
                  onChange={setMemberQuery}
                  placeholder="Sök medlem i skolan…"
                  ariaLabel="Sök medlem"
                />
              </div>
              {members.length === 0 ? (
                <EmptyState
                  icon={<Users size={22} />}
                  title="Inga medlemmar matchar"
                  description="Koppla konton till skolan via listan över konton och skolkoppling."
                  action={
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onTab('installningar')}
                    >
                      Till inställningarna
                    </Button>
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="table table-compact stacked-table">
                    <thead>
                      <tr>
                        <th scope="col">Konto</th>
                        <th scope="col">Roll</th>
                        <th scope="col">Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>
                          Åtgärd
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((row) => (
                        <tr key={row.user_id}>
                          <td data-label="Konto">
                            <span className="account-cell">
                              <Avatar name={row.display_name} size={28} />
                              <span>
                                <span className="account-name">{row.display_name}</span>
                                <span className="account-user">@{row.username}</span>
                              </span>
                            </span>
                          </td>
                          <td data-label="Roll">{ROLE_LABEL[row.role] ?? row.role}</td>
                          <td data-label="Status">
                            {row.active ? (
                              <Badge tone="green">Aktiv</Badge>
                            ) : (
                              <Badge tone="red">Inaktiv</Badge>
                            )}
                          </td>
                          <td data-label="Åtgärd" className="table-actions">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onChangeMembership(row)}
                            >
                              Ändra skolkoppling
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'klasser' && (
            <>
              {schoolClasses.length === 0 ? (
                <EmptyState
                  icon={<Building2 size={22} />}
                  title="Inga klasser i skolan ännu"
                  description="Klasser skapas av lärare och kopplas till skolan när medlemmarna har en skolkoppling."
                />
              ) : (
                <div className="table-wrap">
                  <table className="table table-compact stacked-table">
                    <thead>
                      <tr>
                        <th scope="col">Klass</th>
                        <th scope="col">Lärare</th>
                        <th scope="col">Elever</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schoolClasses.map((row) => (
                        <tr key={row.id}>
                          <td data-label="Klass">
                            <strong>{row.name}</strong>
                            <span className="account-user">{row.subject ?? 'Inget ämne'}</span>
                          </td>
                          <td data-label="Lärare">{row.teacher_names || 'Ingen lärare'}</td>
                          <td data-label="Elever">{row.student_count}</td>
                          <td data-label="Status">
                            {row.archived ? (
                              <Badge tone="amber">Arkiverad</Badge>
                            ) : (
                              <Badge tone="green">Aktiv</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {tab === 'installningar' && (
            <>
              <p className="small muted" style={{ marginTop: 0 }}>
                Redigera skolans uppgifter eller ändra om den ska vara öppen. Inaktivering raderar
                aldrig data – konton, klasser och historik finns kvar.
              </p>
              <div className="detail-grid">
                <div className="kv">
                  <dt>Namn</dt>
                  <dd>{organisation.name}</dd>
                </div>
                <div className="kv">
                  <dt>Kortnamn</dt>
                  <dd>
                    <code>{organisation.slug}</code>
                  </dd>
                </div>
                <div className="kv">
                  <dt>Kommun</dt>
                  <dd>{organisation.municipality ?? 'Saknas'}</dd>
                </div>
                <div className="kv">
                  <dt>Status</dt>
                  <dd>{organisation.active ? 'Aktiv' : 'Inaktiverad'}</dd>
                </div>
              </div>
              <div className="row" style={{ marginTop: 14 }}>
                <Button icon={<Pencil size={15} />} onClick={onEdit}>
                  Redigera uppgifter
                </Button>
                <Button
                  variant={organisation.active ? 'danger' : 'secondary'}
                  icon={<Power size={15} />}
                  onClick={onToggle}
                >
                  {organisation.active ? 'Inaktivera skolan' : 'Aktivera skolan'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/** Enkel sidnumrering för långa listor. */
const Pager: React.FC<{
  page: number;
  total: number;
  shown: number;
  all: number;
  onChange: (page: number) => void;
}> = ({ page, total, shown, all, onChange }) => (
  <div className="pager">
    <span className="small muted">
      Visar {shown} av {all} konton
    </span>
    <div className="pager-controls">
      <button
        type="button"
        className="pager-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Föregående sida"
      >
        ‹
      </button>
      {total <= 1 ? (
        <span className="small muted">Sida 1 av 1</span>
      ) : (
        <span className="small muted">
          Sida {page} av {total}
        </span>
      )}
      <button
        type="button"
        className="pager-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= total}
        aria-label="Nästa sida"
      >
        ›
      </button>
    </div>
  </div>
);

/** Dialog för att byta skolkoppling med sökning och tydlig bekräftelse. */
const MembershipDialog: React.FC<{
  row: AdminMembership;
  organisations: SchoolOrganisation[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ row, organisations, onClose, onSaved }) => {
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<string | null>(row.organisation_id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return organisations.filter((org) =>
      needle ? `${org.name} ${org.municipality ?? ''}`.toLowerCase().includes(needle) : true,
    );
  }, [organisations, query]);

  const unchanged = (choice ?? null) === (row.organisation_id ?? null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await assignMembership(row.user_id, choice || null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara kopplingen.');
    } finally {
      setBusy(false);
    }
  };

  const chosenName = organisations.find((org) => org.id === choice)?.name ?? 'Ingen skola';

  return (
    <Modal
      open
      title="Ändra skolkoppling"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} disabled={unchanged} onClick={() => void save()}>
            Spara koppling
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <p className="small muted" style={{ marginTop: 0 }}>
        Välj skola för <strong>{row.display_name}</strong> (@{row.username}). Ett byte avslutar den
        gamla kopplingen och åtkomsten till den gamla skolans privata meddelanden upphör.
      </p>

      <Field label="Sök skola" htmlFor="membership-search">
        <SearchField
          id="membership-search"
          value={query}
          onChange={setQuery}
          placeholder="Sök skola eller kommun…"
          ariaLabel="Sök skola för koppling"
          autoFocus
        />
      </Field>

      <div className="org-grid" style={{ gridTemplateColumns: '1fr' }}>
        <button
          type="button"
          className={`org-card${choice === null ? ' is-active' : ''}`}
          onClick={() => setChoice(null)}
          aria-pressed={choice === null}
        >
          <span className="org-name">Ingen skola</span>
          <span className="org-meta">Kontot kopplas bort från sin skola.</span>
        </button>
        {options.map((org) => (
          <button
            key={org.id}
            type="button"
            className={`org-card${choice === org.id ? ' is-active' : ''}`}
            onClick={() => setChoice(org.id)}
            aria-pressed={choice === org.id}
          >
            <span className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
              <span className="org-name">{org.name}</span>
              {choice === org.id ? <Check size={16} color="var(--green)" /> : null}
            </span>
            <span className="org-meta">
              {org.municipality ?? 'Kommun saknas'} · {org.members} konton
              {org.active ? '' : ' · inaktiverad'}
            </span>
          </button>
        ))}
        {options.length === 0 && (
          <p className="small muted">Inga skolor matchar sökningen.</p>
        )}
      </div>

      <p className="small muted" style={{ marginBottom: 0 }}>
        Vald skola: <strong>{chosenName}</strong>
      </p>
    </Modal>
  );
};

/** Bekräftelse för åtgärder som påverkar en hel skola. */
const ConfirmDialog: React.FC<{
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}> = ({ title, description, confirmLabel, onClose, onConfirm }) => (
  <Modal
    open
    title={title}
    onClose={onClose}
    footer={
      <>
        <Button variant="ghost" onClick={onClose}>
          Avbryt
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </>
    }
  >
    <p style={{ margin: 0 }}>{description}</p>
  </Modal>
);

const OrganisationForm: React.FC<{
  row: SchoolOrganisation | null;
  onClose: () => void;
  onSaved: (id?: string) => Promise<void>;
}> = ({ row, onClose, onSaved }) => {
  const [name, setName] = useState(row?.name ?? '');
  const [slug, setSlug] = useState(row?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(row));
  const [email, setEmail] = useState(row?.contact_email ?? '');
  const [municipality, setMunicipality] = useState(row?.municipality ?? '');
  const [active, setActive] = useState(row?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Skolans namn måste vara minst 2 tecken.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await saveOrganisation({
        id: row?.id ?? null,
        name,
        slug: slug || suggestSlug(name),
        municipality,
        contactEmail: email,
        active,
      });
      await onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skolan kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={row ? 'Redigera skola' : 'Skapa skola'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            {row ? 'Spara' : 'Skapa skola'}
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      {!row && (
        <p className="small muted" style={{ marginTop: 0 }}>
          Skolan skapas tom. Koppla konton och klasser när skolan finns.
        </p>
      )}
      <Field label="Skolans namn" htmlFor="org-name" required>
        <input
          id="org-name"
          className="input"
          value={name}
          maxLength={120}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugTouched) setSlug(suggestSlug(event.target.value));
          }}
        />
      </Field>
      <Field
        label="Kortnamn"
        htmlFor="org-slug"
        hint="Används internt, till exempel i länkar. A–z, siffror och bindestreck."
        required
      >
        <input
          id="org-slug"
          className="input"
          value={slug}
          maxLength={62}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value.toLowerCase());
          }}
        />
      </Field>
      <MunicipalityPicker
        id="org-municipality"
        value={municipality}
        onChange={setMunicipality}
        label="Kommun"
        hint="Kommunen skolan ligger i. Används när konton kopplas till skolan."
      />
      <Field label="Kontaktadress" htmlFor="org-email" hint="Visas för skolans användare.">
        <input
          id="org-email"
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <label className="row small" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Skolan är aktiv
      </label>
    </Modal>
  );
};
