import React, { useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Search, ShieldCheck, Users } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import {
  assignMembership,
  listMemberships,
  listOrganisations,
  saveOrganisation,
  setOrganisationActive,
} from '../../lib/api';
import { shortDate } from '../../lib/format';
import type { AdminMembership, SchoolOrganisation } from '../../lib/types';
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
  Stat,
} from '../../components/ui';

const ROLE_LABEL: Record<string, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Systemadministratör',
  okand: 'Okänd roll',
};

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

export const AdminOrganisations: React.FC = () => {
  const state = useAsync(async () => {
    const [organisations, people] = await Promise.all([listOrganisations(), listMemberships()]);
    return { organisations, people };
  }, []);

  const [editing, setEditing] = useState<SchoolOrganisation | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [schoolFilter, setSchoolFilter] = useState<'alla' | 'utan' | string>('alla');

  const organisations = state.data?.organisations ?? [];
  const people = state.data?.people ?? [];

  const filteredPeople = useMemo(() => {
    const text = query.trim().toLowerCase();
    return people
      .filter((row) => {
        if (schoolFilter === 'utan') return !row.organisation_id;
        if (schoolFilter !== 'alla') return row.organisation_id === schoolFilter;
        return true;
      })
      .filter((row) =>
        text
          ? `${row.display_name} ${row.username} ${row.organisation_name ?? ''}`
              .toLowerCase()
              .includes(text)
          : true,
      );
  }, [people, query, schoolFilter]);

  const unlinked = people.filter((row) => !row.organisation_id).length;

  const toggleActive = async (row: SchoolOrganisation) => {
    setError(null);
    try {
      await setOrganisationActive(row.id, !row.active);
      setNotice(
        row.active
          ? `”${row.name}” är inaktiverad. Inloggade konton behåller sin koppling men skolan är stängd.`
          : `”${row.name}” är aktiverad igen.`,
      );
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ändra skolans status.');
    }
  };

  if (state.loading) return <Spinner label="Hämtar skolorna…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Skolor" />
        <Card>
          <EmptyState
            title="Kunde inte hämta skolorna"
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
        title="Skolor och medlemskap"
        description="En skolorganisation per skola. Alla elever, lärare och speciallärare ska vara kopplade till sin skola – kommunikation och data hålls separerade mellan skolorna."
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setEditing('new')}>
            Ny skola
          </Button>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid-4">
        <Stat label="Skolor" value={organisations.length} hint={`${organisations.filter((row) => row.active).length} aktiva`} />
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
        subtitle="Aktiva skolor kan användas direkt. En inaktiverad skola behåller all data men stängs för ny kommunikation."
        action={<Building2 size={18} color="var(--green)" />}
      >
        {organisations.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} />}
            title="Ingen skola skapad ännu"
            description="Skapa den första skolorganisationen. Därefter kan du koppla konton och klasser till den."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setEditing('new')}>
                Skapa skola
              </Button>
            }
          />
        ) : (
          <div className="list">
            {organisations.map((row) => (
              <div key={row.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                <div className="list-main">
                  <p className="list-title">
                    {row.name}{' '}
                    {row.active ? (
                      <Badge tone="green">Aktiv</Badge>
                    ) : (
                      <Badge tone="red">Inaktiverad</Badge>
                    )}
                  </p>
                  <p className="list-sub">
                    {row.members} konton · {row.students} elever · {row.teachers} lärare ·{' '}
                    {row.special_teachers} speciallärare · {row.classes} klasser
                  </p>
                  <p className="list-sub">
                    <code>{row.slug}</code>
                    {row.contact_email ? ` · ${row.contact_email}` : ''} · skapad{' '}
                    {shortDate(row.created_at)}
                  </p>
                </div>
                <div className="list-side row" style={{ gap: 6 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil size={14} />}
                    onClick={() => setEditing(row)}
                  >
                    Redigera
                  </Button>
                  <Button
                    size="sm"
                    variant={row.active ? 'ghost' : 'secondary'}
                    onClick={() => void toggleActive(row)}
                  >
                    {row.active ? 'Inaktivera' : 'Aktivera'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Konton och skolkoppling"
        subtitle="Varje konto har högst en aktiv skola. Ett byte avslutar den gamla kopplingen och åtkomsten till den gamlas privata meddelanden upphör."
        action={<Users size={18} color="var(--green)" />}
      >
        {unlinked > 0 && (
          <Alert tone="info">
            {unlinked} {unlinked === 1 ? 'konto saknar' : 'konton saknar'} skola. De kan logga in
            men kan inte
            använda vanliga interna meddelanden förrän du kopplar dem.
          </Alert>
        )}

        <div className="filter-bar" style={{ marginBottom: 12 }}>
          <div className="search-field" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} aria-hidden />
            <input
              className="input"
              placeholder="Sök namn eller användarnamn"
              aria-label="Sök konton"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="input"
            style={{ maxWidth: 260 }}
            aria-label="Filtrera på skola"
            value={schoolFilter}
            onChange={(event) => setSchoolFilter(event.target.value)}
          >
            <option value="alla">Alla skolor</option>
            <option value="utan">Utan skola</option>
            {organisations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </div>

        {filteredPeople.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title="Inga konton matchar"
            description="Prova ett annat sökord eller ett annat skolfilter."
          />
        ) : (
          <div className="list">
            {filteredPeople.map((row) => (
              <MembershipRow
                key={row.user_id}
                row={row}
                organisations={organisations}
                onChanged={async () => {
                  setNotice('Skolkopplingen är sparad.');
                  await state.reload();
                }}
              />
            ))}
          </div>
        )}
      </Card>

      <div className="notice">
        <ShieldCheck size={17} />
        <span>
          Systemadministratören är den enda administrativa nivån. Det finns ingen skolchefs- eller
          skoladministratörsroll, och rollen kan inte tilldelas från klienten – den sätts bara
          serversidigt.
        </span>
      </div>

      {editing && (
        <OrganisationForm
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice('Skolan är sparad.');
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const MembershipRow: React.FC<{
  row: AdminMembership;
  organisations: SchoolOrganisation[];
  onChanged: () => Promise<void>;
}> = ({ row, organisations, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await assignMembership(row.user_id, value || null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara kopplingen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <div className="list-main">
        <p className="list-title">
          {row.display_name}{' '}
          {!row.active && <Badge tone="red">Inaktiv</Badge>}
          {row.role === 'admin' && <Badge tone="blue">Systemadministratör</Badge>}
        </p>
        <p className="list-sub">
          @{row.username} · {ROLE_LABEL[row.role] ?? row.role}
        </p>
        {error && <p className="field-error">{error}</p>}
      </div>
      <select
        className="input"
        style={{ maxWidth: 260 }}
        aria-label={`Skola för ${row.display_name}`}
        value={row.organisation_id ?? ''}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
      >
        <option value="">Ingen skola</option>
        {organisations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
            {org.active ? '' : ' (inaktiv)'}
          </option>
        ))}
      </select>
    </div>
  );
};

const OrganisationForm: React.FC<{
  row: SchoolOrganisation | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}> = ({ row, onClose, onSaved }) => {
  const [name, setName] = useState(row?.name ?? '');
  const [slug, setSlug] = useState(row?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(row));
  const [email, setEmail] = useState(row?.contact_email ?? '');
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
      await saveOrganisation({
        id: row?.id ?? null,
        name,
        slug: slug || suggestSlug(name),
        contactEmail: email,
        active,
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Skolan kunde inte sparas.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={row ? 'Redigera skola' : 'Ny skola'}
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
