import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  KeyRound,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { PanelKind } from '../components/AppShell';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  listClassRoster,
  listClasses,
  loadContact,
  saveContact,
  saveMyName,
} from '../lib/api';
import { dateTime, displayName, shortDate } from '../lib/format';
import { validateNewPassword, MIN_PASSWORD_LENGTH } from '../lib/password';
import { defaultStartPage, saveStartPage } from '../lib/settings';
import { cachedSchoolSettings, subscribeSchoolSettings } from '../lib/school-settings';
import type { Contact } from '../lib/types';
import { Alert, Avatar, Badge, Button, Card, Field, PageIntro, Spinner } from '../components/ui';
import { HalloweenInvite } from '../components/halloween/HalloweenInvite';

interface Props {
  panel: PanelKind;
  onNavigate: (page: string) => void;
}

const START_OPTIONS: Record<PanelKind, Array<{ id: string; label: string }>> = {
  elev: [
    { id: 'hem', label: 'Hem' },
    { id: 'uppgifter', label: 'Uppgifter' },
    { id: 'amnen', label: 'Mina ämnen och material' },
    { id: 'kalender', label: 'Kalender och planering' },
  ],
  larare: [
    { id: 'oversikt', label: 'Översikt' },
    { id: 'uppgifter', label: 'Uppgifter och aktiviteter' },
    { id: 'klasser', label: 'Mina klasser och elever' },
    { id: 'kalender', label: 'Kalender och planering' },
  ],
  speciallarare: [
    { id: 'hem', label: 'Översikt' },
    { id: 'elever', label: 'Mina elever och elevstöd' },
    { id: 'meddelanden', label: 'Meddelanden' },
  ],
  admin: [
    { id: 'oversikt', label: 'Översikt' },
    { id: 'organisationer', label: 'Skolor och medlemskap' },
    { id: 'publiceringar', label: 'Nyheter och uppdateringar' },
    { id: 'anvandare', label: 'Användare och konton' },
    { id: 'logg', label: 'Aktivitetslogg' },
  ],
};

export const Profil: React.FC<Props> = ({ panel, onNavigate }) => {
  const { identity, profile, refreshProfile, logout } = useAuth();
  const contactState = useAsync(loadContact, []);

  const [firstName, setFirstName] = useState(profile?.first_name ?? '');
  const [lastName, setLastName] = useState(profile?.last_name ?? '');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const name = profile ? displayName(profile) : identity?.username ?? '';

  const saveName = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      setNameError('Fyll i ditt förnamn.');
      return;
    }
    setNameBusy(true);
    setNameError(null);
    setNameMessage(null);
    try {
      await saveMyName(firstName, lastName);
      await refreshProfile();
      setNameMessage('Namnet är sparat.');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Kunde inte spara namnet.');
    } finally {
      setNameBusy(false);
    }
  };

  return (
    <div>
      <PageIntro
        eyebrow={panel === 'larare' ? 'Lärarpanel' : panel === 'admin' ? 'Administratörspanel' : 'Elevpanel'}
        title="Profil och inställningar"
        description="Dina uppgifter, kontaktinformation, inställningar och kontosäkerhet. Skoladministrerade uppgifter kan bara ändras av skolan."
      />

      <div className="profile-head">
        <Avatar name={name} size={72} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>{name}</h2>
          <p>@{identity?.username}</p>
          <div className="row">
            <Badge tone="green">{panel === 'larare' ? 'Lärare' : panel === 'admin' ? 'Administratör' : 'Skolelev'}</Badge>
            {profile?.account_type && <Badge tone="neutral">{profile.account_type === 'privat' ? 'Privat konto' : 'Skolkonto'}</Badge>}
            <Badge tone={identity?.active ? 'green' : 'red'}>{identity?.active ? 'Kontot är aktivt' : 'Kontot är inaktiverat'}</Badge>
          </div>
        </div>
      </div>

      {panel === 'elev' && (
        <HalloweenInvite onOpen={() => onNavigate('halloween')} variant="card" />
      )}

      <div className="profile-grid">
        <div className="span-2">
          <SchoolInfo panel={panel} />
        </div>

        {/* Personuppgifter */}
        <Card
          title="Personuppgifter"
          subtitle="Förnamn och efternamn kan du ändra själv"
          action={<UserRound size={18} color="var(--green)" />}
        >
          {nameMessage && <Alert tone="success">{nameMessage}</Alert>}
          {nameError && <Alert>{nameError}</Alert>}
          <div className="grid-2">
            <Field label="Förnamn" htmlFor="profile-first">
              <input id="profile-first" className="input" value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </Field>
            <Field label="Efternamn" htmlFor="profile-last">
              <input id="profile-last" className="input" value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </Field>
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <Button size="sm" loading={nameBusy} onClick={() => void saveName()}>Spara namn</Button>
          </div>
          <div className="dl">
            <div><dt>Användarnamn</dt><dd>@{identity?.username}</dd></div>
            <div><dt>Roll</dt><dd>{panel === 'larare' ? 'Lärare' : panel === 'admin' ? 'Administratör' : 'Skolelev'}</dd></div>
            <div><dt>Skola</dt><dd>{profile?.organisation || 'Ej angiven i profilen'}</dd></div>
            <div><dt>Konto skapades</dt><dd>{profile?.created_at ? shortDate(profile.created_at) : '—'}</dd></div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Personnummer hanteras inte i Elda Skola. Klass, skolplacering och roll
            sätts av skolan och kan inte ändras här.
          </p>
        </Card>

        {/* Kontaktuppgifter */}
        <Card
          title="Kontaktuppgifter"
          subtitle="Bara du och skolans behöriga personal ser dem"
          action={<Mail size={18} color="var(--green)" />}
        >
          {contactState.loading ? (
            <Spinner label="Hämtar kontaktuppgifter…" />
          ) : (
            <ContactForm initial={contactState.data} onSaved={() => void contactState.reload()} />
          )}
        </Card>

        {/* Inställningar */}
        <Card title="Inställningar" subtitle="Sparas på den här enheten" action={<Palette size={18} color="var(--green)" />}>
          <SettingsPanel panel={panel} onNavigate={onNavigate} />
        </Card>

        {/* Säkerhet */}
        <Card title="Konto och säkerhet" subtitle="Lösenordet hanteras av Supabase Auth" action={<ShieldCheck size={18} color="var(--green)" />}>
          <SecurityPanel />
        </Card>

        <div className="span-2">
          <Card title="Ditt konto" subtitle="Status och session">
            <div className="dl">
              <div><dt>Inloggad som</dt><dd>{name} (@{identity?.username})</dd></div>
              <div><dt>Senaste inloggning</dt><dd>{identity?.lastSignInAt ? dateTime(identity.lastSignInAt) : 'Tillhandahålls inte av inloggningen'}</dd></div>
              <div><dt>Totalt antal inloggningar</dt><dd>Rapporteras inte av Supabase Auth</dd></div>
              <div><dt>Session</dt><dd>Aktiv på den här enheten</dd></div>
            </div>
            {identity?.mustChangePassword && (
              <Alert tone="info">Ditt konto har kvar ett tillfälligt lösenord. Byt det under Konto och säkerhet.</Alert>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <Button variant="ghost" onClick={() => void logout()}>Logga ut</Button>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Elda Skola visar bara uppgifter som autentiseringen faktiskt levererar.
              Antal inloggningar och en historik över sessioner finns inte i
              Supabase Auth och visas därför inte.
            </p>
          </Card>
        </div>

        <div className="span-2">
          <Card title="Kalender och iCalendar" subtitle="Personligt kalenderflöde" action={<BookOpen size={18} color="var(--green)" />}>
            <div className="notice">
              <Lock size={17} />
              <span>
                Ett personligt iCalendar-flöde är inte aktiverat i den här versionen.
                Det kräver en serverfunktion som skapar en hemlig, återkallelig länk
                per användare och en publik, signerad slutpunkt som bara läser de
                händelser användaren får se. Ingen sådan slutpunkt finns i backend
                ännu, och därför visas ingen låtsaslänk här.
              </span>
            </div>
            <p className="small muted" style={{ marginTop: 10 }}>
              Tills flödet är byggt kan du följa dina deadlines i Kalender och
              planering i appen.
            </p>
            <Button size="sm" variant="ghost" onClick={() => onNavigate('kalender')}>
              Öppna kalendern
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

const SchoolInfo: React.FC<{ panel: PanelKind }> = ({ panel }) => {
  // Skolans kontaktadress kommer från skolinställningarna.
  const [school, setSchool] = useState(cachedSchoolSettings);
  useEffect(() => subscribeSchoolSettings(setSchool), []);

  const state = useAsync(async () => {
    const classes = await listClasses();
    const rosters =
      panel === 'elev'
        ? await Promise.all(classes.map((row) => listClassRoster(row.id)))
        : [];
    return { classes, rosters };
  }, [panel]);

  return (
    <Card title="Skolinformation" subtitle="Det som är kopplat till ditt konto i skolan" action={<BookOpen size={18} color="var(--green)" />}>
      {state.loading ? (
        <Spinner label="Hämtar skolinformation…" />
      ) : state.error ? (
        <Alert>{state.error}</Alert>
      ) : (state.data?.classes.length ?? 0) === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          {panel === 'larare'
            ? 'Du är inte lärare för någon klass ännu. Skapa en klass under Mina klasser och elever.'
            : 'Du är inte kopplad till någon klass ännu. Din lärare eller klasskoden ger dig tillgång.'}
        </p>
      ) : (
        <div className="list">
          {state.data?.classes.map((row, index) => {
            const teachers = (state.data?.rosters[index] ?? []).filter(
              (person) => person.member_role === 'larare',
            );
            return (
              <div key={row.id} className="list-row">
                <div className="list-main">
                  <p className="list-title">{row.name}</p>
                  <p className="list-sub">
                    {row.subject || 'Ämne saknas'} · {row.member_count} medlemmar
                    {panel === 'elev' && teachers.length > 0
                      ? ` · Lärare: ${teachers.map((person) => person.display_name).join(', ')}`
                      : ''}
                  </p>
                </div>
                <Badge tone="green">{row.member_role === 'larare' ? 'Lärare' : 'Elev'}</Badge>
              </div>
            );
          })}
        </div>
      )}
      {school.contact_email && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Skolans kontaktadress:{' '}
          <a href={`mailto:${school.contact_email}`}>{school.contact_email}</a>
        </p>
      )}
      <p className="small muted" style={{ marginTop: 10 }}>
        Klass, ämne och skolplacering sätts av skolan. Samma konto och profil används
        även om du läser flera ämnesklasser.
      </p>
    </Card>
  );
};

const ContactForm: React.FC<{ initial: Contact | null; onSaved: () => void }> = ({ initial, onSaved }) => {
  const [email, setEmail] = useState(initial?.contact_email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [mobile, setMobile] = useState(initial?.mobile ?? '');
  const [street, setStreet] = useState(initial?.street_address ?? '');
  const [postal, setPostal] = useState(initial?.postal_address ?? '');
  const [alt, setAlt] = useState(initial?.alt_contact ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await saveContact({
        contact_email: email,
        phone,
        mobile,
        street_address: street,
        postal_address: postal,
        alt_contact: alt,
      });
      setMessage('Kontaktuppgifterna är sparade.');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara kontaktuppgifterna.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save}>
      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="E-postadress" htmlFor="contact-email">
          <input id="contact-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
        </Field>
        <Field label="Mobiltelefon" htmlFor="contact-mobile">
          <input id="contact-mobile" className="input" value={mobile} onChange={(event) => setMobile(event.target.value)} autoComplete="tel-national" />
        </Field>
        <Field label="Telefon" htmlFor="contact-phone">
          <input id="contact-phone" className="input" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Alternativ kontakt" htmlFor="contact-alt" hint="T.ex. vårdnadshavares telefon, om skolan behöver den.">
          <input id="contact-alt" className="input" value={alt} onChange={(event) => setAlt(event.target.value)} />
        </Field>
        <Field label="Gatuadress" htmlFor="contact-street">
          <input id="contact-street" className="input" value={street} onChange={(event) => setStreet(event.target.value)} autoComplete="street-address" />
        </Field>
        <Field label="Postadress" htmlFor="contact-postal">
          <input id="contact-postal" className="input" value={postal} onChange={(event) => setPostal(event.target.value)} autoComplete="postal-code" />
        </Field>
      </div>
      <div className="row">
        <Button type="submit" loading={busy} size="sm">Spara kontaktuppgifter</Button>
        {initial?.updated_at && <span className="small muted">Senast ändrad {shortDate(initial.updated_at)}</span>}
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Uppgifterna lagras i en egen tabell som bara du kan läsa. Lärare och
        klasskamrater kommer inte åt dem.
      </p>
    </form>
  );
};

const SettingsPanel: React.FC<{ panel: PanelKind; onNavigate: (page: string) => void }> = ({ panel, onNavigate }) => {
  const [start, setStart] = useState(() => defaultStartPage(panel));
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <div>
      {saved && <Alert tone="success">{saved}</Alert>}

      <div className="settings-row">
        <div>
          <strong>Språk</strong>
          <small>Gränssnittet är på svenska</small>
        </div>
        <Badge tone="green">Svenska</Badge>
      </div>

      <div className="settings-row">
        <div>
          <strong>Tema</strong>
          <small>Elda Skola använder skolans ljusa tema</small>
        </div>
        <Badge tone="neutral">Ljust</Badge>
      </div>

      <div className="settings-row">
        <div>
          <strong>Startsida</strong>
          <small>Sidan som öppnas när du loggar in</small>
        </div>
        <select
          className="input"
          style={{ width: 220 }}
          value={start}
          onChange={(event) => {
            const next = event.target.value;
            setStart(next);
            saveStartPage(panel, next);
            setSaved('Startsidan är sparad och används nästa gång du öppnar Elda Skola.');
          }}
          aria-label="Välj startsida"
        >
          {START_OPTIONS[panel].map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <strong>Notiser</strong>
          <small>E-post- och pushnotiser är inte aktiverade i den här versionen</small>
        </div>
        <Badge tone="neutral">Ej tillgängligt</Badge>
      </div>

      <div className="settings-row">
        <div>
          <strong>Tillgänglighet</strong>
          <small>Appen följer systemets inställning för reducerad rörelse</small>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onNavigate(start)}>Öppna startsidan</Button>
      </div>

      <p className="small muted" style={{ marginTop: 10 }}>
        Inställningar som inte är byggda visas som otillgängliga i stället för att
        se ut att fungera.
      </p>
    </div>
  );
};

const SecurityPanel: React.FC = () => {
  const { identity, changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(identity?.mustChangePassword ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateNewPassword(next, confirm, identity?.username);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await changePassword(current, next);
      if (!result.ok) {
        setError(result.error ?? 'Lösenordet kunde inte bytas.');
        return;
      }
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {done && <Alert tone="success">Lösenordet är bytt. Använd det nästa gång du loggar in.</Alert>}
      {!open ? (
        <>
          <p className="small muted">
            Ditt lösenord lagras krypterat av Supabase Auth och kan aldrig läsas ut.
            Bytet verifierar ditt nuvarande lösenord innan det nya sparas.
          </p>
          <div className="row">
            <Button size="sm" variant="secondary" icon={<KeyRound size={15} />} onClick={() => setOpen(true)}>
              Byt lösenord
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDone(false)} hidden={!done}>Rensa</Button>
          </div>
        </>
      ) : (
        <form onSubmit={save}>
          {error && <Alert>{error}</Alert>}
          <Field label="Nuvarande lösenord" htmlFor="pw-current" required>
            <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </Field>
          <div className="grid-2">
            <Field label="Nytt lösenord" htmlFor="pw-next" hint={`Minst ${MIN_PASSWORD_LENGTH} tecken.`} required>
              <input id="pw-next" className="input" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
            </Field>
            <Field label="Bekräfta nytt lösenord" htmlFor="pw-confirm" required>
              <input id="pw-confirm" className="input" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </Field>
          </div>
          <div className="row">
            <Button type="submit" size="sm" loading={busy} icon={<Check size={15} />}>Spara lösenord</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>
              <ChevronDown size={15} /> Avbryt
            </Button>
          </div>
          {error && (
            <p className="field-error">
              <AlertCircle size={13} /> Kontrollera uppgifterna och försök igen.
            </p>
          )}
        </form>
      )}
    </div>
  );
};
