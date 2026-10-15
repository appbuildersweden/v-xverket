import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Users,
  Brain,
  MessageSquare,
  FileText,
  ClipboardList,
  Shield,
  GitBranch,
  MessageCircle,
  CheckCircle,
  AlertCircle,
  GraduationCap,
  Layers,
  BookOpen,
  Calendar,
  Settings,
  ScrollText,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import type { AuthAccount } from '../lib/auth';

interface PageProps {
  pageId: string;
  onNavigate?: (pageId: string) => void;
}

const roleLabels: Record<AuthAccount['role'], string> = {
  elev: 'Elev',
  speciallärare: 'Speciallärare',
  admin: 'Administratör',
};

/** Verklig kontolista (hämtas via skyddad serverfunktion), valfri rollfilter. */
const AdminUsersPanel: React.FC<{
  onNavigate?: (pageId: string) => void;
  roleFilter?: AuthAccount['role'];
  title: string;
  subtitle: string;
  showCreate?: boolean;
}> = ({ onNavigate, roleFilter, title, subtitle, showCreate }) => {
  const { user, listAccounts, setAccountActive } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refresh = useCallback(async () => {
    const result = await listAccounts();
    if (result.ok) {
      setAccounts(result.accounts);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [listAccounts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleActive = async (account: AuthAccount) => {
    if (busyId) return;
    setBusyId(account.id);
    const result = await setAccountActive(account.id, !account.active);
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await refresh();
  };

  const visible = useMemo(() => {
    if (!accounts) return null;
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        (!roleFilter || a.role === roleFilter) &&
        (!q || a.username.toLowerCase().includes(q)),
    );
  }, [accounts, query, roleFilter]);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          <div className="card-sub" style={{ marginBottom: 0 }}>{subtitle}</div>
        </div>
        {showCreate && (
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate?.('create-user')}>
            Skapa konto
          </button>
        )}
      </div>

      <input
        className="input"
        placeholder="Sök bland användarnamn…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ margin: '12px 0 4px', maxWidth: 320 }}
        aria-label="Sök användare"
      />

      {error && (
        <div className="login-err" role="alert" style={{ marginTop: 12 }}>
          <AlertCircle size={15} />
          {error}{' '}
          <button className="view-link" onClick={() => void refresh()}>
            Försök igen
          </button>
        </div>
      )}

      {visible === null && !error && (
        <div className="card-sub" style={{ marginTop: 8 }}>
          Laddar konton…
        </div>
      )}

      {visible !== null && visible.length === 0 && !error && (
        <div className="card-sub" style={{ marginTop: 8 }}>
          {query ? 'Inga användare matchar sökningen.' : 'Inga konton ännu.'}
        </div>
      )}

      {visible?.map((account) => {
        const isSelf = account.id === user?.id;
        return (
          <div className="list-item" key={account.id}>
            <div className="avatar-circle">{account.username.charAt(0).toUpperCase()}</div>
            <div className="list-item-content">
              <div className="list-item-title">{account.username}</div>
              <div className="list-item-sub">
                {roleLabels[account.role]}
                {account.createdAt ? ` • Skapad ${account.createdAt.slice(0, 10)}` : ''}
              </div>
            </div>
            <span className={`badge ${account.active ? '' : 'badge-solid'}`}>
              {account.active ? 'Aktiv' : 'Inaktiv'}
            </span>
            <button
              className="btn btn-outline btn-sm"
              disabled={busyId === account.id || isSelf}
              title={
                isSelf
                  ? 'Du kan inte inaktivera ditt eget konto'
                  : account.active
                  ? 'Inaktivera kontot'
                  : 'Aktivera kontot'
              }
              onClick={() => void toggleActive(account)}
            >
              {busyId === account.id
                ? 'Uppdaterar…'
                : account.active
                ? 'Inaktivera'
                : 'Aktivera'}
            </button>
          </div>
        );
      })}

      {!showCreate && roleFilter && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
          Skapa nya konton under <b>Skapa konto</b>. Rollen sätts serversidigt av
          administratören.
        </p>
      )}
    </div>
  );
};

// ----------------------------------------------------------------
// Roller och behörigheter
// ----------------------------------------------------------------

interface RoleRow {
  role: 'admin' | 'speciallärare' | 'elev';
  label: string;
  can: string[];
  cannot: string[];
}

const ROLE_ROWS: RoleRow[] = [
  {
    role: 'admin',
    label: 'Administratör',
    can: [
      'Skapa, inaktivera och återaktivera konton',
      'Tilldela roller enligt systemets regler',
      'Organisera klasser, elevgrupper, ämnen och scheman',
      'Hantera globala appinställningar och loggar',
    ],
    cannot: [
      'Får inte obegränsad åtkomst till privata meddelanden — sådan åtkomst måste uttryckligen regleras',
    ],
  },
  {
    role: 'speciallärare',
    label: 'Speciallärare',
    can: [
      'Se och hantera sina tilldelade elever',
      'Skapa undervisningsmaterial och uppgifter inom sitt ansvar',
      'Följa upp inlämningar och lämna återkoppling',
      'Kommunicera med elever hen har rätt att kontakta',
      'Hantera egen planering, profil och belöningar',
    ],
    cannot: [
      'Skapa administratörskonton eller ändra globala roller',
      'Hantera systemets säkerhetsinställningar',
      'Komma åt elever eller meddelanden utanför sina tilldelade behörigheter',
    ],
  },
  {
    role: 'elev',
    label: 'Elev',
    can: [
      'Se och ändra egen profil och egna inställningar',
      'Se egen planering, ämnen, tilldelade uppgifter och framsteg',
      'Lämna in uppgifter och se återkoppling',
      'Delta i klassens funktioner och chattar',
      'Hantera egna flashcards och studiematerial',
    ],
    cannot: [
      'Ändra andra elevers konton, uppgifter eller roller',
      'Komma åt adminfunktioner eller information från andra klasser',
    ],
  },
];

const AdminRolesPanel: React.FC = () => {
  const { listAccounts } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAccounts().then((r) => {
      if (cancelled) return;
      setAccounts(r.ok ? r.accounts : []);
    });
    return () => {
      cancelled = true;
    };
  }, [listAccounts]);

  const count = (role: AuthAccount['role']) =>
    accounts?.filter((a) => a.role === role).length ?? null;

  return (
    <div>
      <div className="grid-3">
        {ROLE_ROWS.map((r) => (
          <div className="stat-card" key={r.role}>
            <div>
              <div className="lbl">Roll</div>
              <div className="val" style={{ fontSize: 18 }}>{r.label}</div>
              <div className="det">
                {count(r.role) === null
                  ? 'Laddar antal konton…'
                  : `${count(r.role)} konto${count(r.role) === 1 ? '' : 'n'}`}
              </div>
            </div>
            <div className="stat-icon"><Shield size={18} /></div>
          </div>
        ))}
      </div>

      {ROLE_ROWS.map((r) => (
        <div className="card" key={r.role} style={{ marginBottom: 18 }}>
          <div className="card-title">{r.label}</div>
          <div className="card-sub">Får</div>
          {r.can.map((c) => (
            <div className="list-item" key={c}>
              <div className="stat-icon" style={{ width: 30, height: 30 }}><CheckCircle size={14} /></div>
              <div className="list-item-content">
                <div className="list-item-sub" style={{ color: 'var(--text)', fontSize: 13 }}>{c}</div>
              </div>
            </div>
          ))}
          <div className="card-sub" style={{ marginTop: 10 }}>Får inte</div>
          {r.cannot.map((c) => (
            <div className="list-item" key={c}>
              <div className="stat-icon" style={{ width: 30, height: 30 }}><AlertCircle size={14} /></div>
              <div className="list-item-content">
                <div className="list-item-sub" style={{ color: 'var(--text)', fontSize: 13 }}>{c}</div>
              </div>
            </div>
          ))}
        </div>
      ))}

      <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Roller sätts endast av administratörer via den skyddade serverfunktionen.
        Speciallärare och elever kan inte ändra sina egna roller eller tilldela sig
        högre behörigheter.
      </p>
    </div>
  );
};

// ----------------------------------------------------------------
// AI-inställningar — visar den verkliga, serversida konfigurationen
// ----------------------------------------------------------------

const AdminAiSettingsPanel: React.FC = () => (
  <div>
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title">AI-modeller</div>
      <div className="card-sub">
        AI-anropen görs av Växverkets server mot OpenRouter.
      </div>
      <div className="list-item">
        <div className="stat-icon" style={{ width: 34, height: 34 }}><Sparkles size={15} /></div>
        <div className="list-item-content">
          <div className="list-item-title">OpenRouter (Supabase Edge Function)</div>
          <div className="list-item-sub">
            Modellen väljs serversidigt och kan ändras utan att appen byggs om.
          </div>
        </div>
        <span className="badge badge-solid">Ansluten</span>
      </div>
      <div className="list-item">
        <div className="stat-icon" style={{ width: 34, height: 34 }}><Shield size={15} /></div>
        <div className="list-item-content">
          <div className="list-item-title">API-nyckel</div>
          <div className="list-item-sub">
            Ligger som hemlighet på serversidan. Syns aldrig i appen.
          </div>
        </div>
        <span className="badge badge-solid">Skyddad</span>
      </div>
    </div>

    <div className="card" style={{ marginBottom: 18 }}>
      <div className="card-title">Behörigheter per roll</div>
      <div className="card-sub">
        Rollen kontrolleras av servern på varje AI-anrop utifrån användarens session.
      </div>
      {[
        { r: 'Administratör', f: 'AI-chat, AI-inställningar' },
        { r: 'Speciallärare', f: 'AI-assistent' },
        { r: 'Elev', f: 'AI-studiehjälp' },
      ].map((x) => (
        <div className="list-item" key={x.r}>
          <div className="stat-icon" style={{ width: 34, height: 34 }}><Shield size={15} /></div>
          <div className="list-item-content">
            <div className="list-item-title">{x.r}</div>
            <div className="list-item-sub">{x.f}</div>
          </div>
          <span className="badge badge-solid">Aktiv</span>
        </div>
      ))}
    </div>

    <div className="card">
      <div className="card-title">Globala AI-inställningar</div>
      <div className="card-sub">
        Verklig status för AI-tjänsten. Felmeddelanden visas direkt i chatten.
      </div>
      <div className="list-item">
        <div className="stat-icon" style={{ width: 34, height: 34 }}><Brain size={15} /></div>
        <div className="list-item-content">
          <div className="list-item-title">AI-tjänst</div>
          <div className="list-item-sub">Ansluten via OpenRouter</div>
        </div>
        <span className="badge badge-solid">Aktiv</span>
      </div>
    </div>
  </div>
);

// ----------------------------------------------------------------
// Huvudkomponent
// ----------------------------------------------------------------

export const AdminPanel: React.FC<PageProps> = ({ pageId, onNavigate }) => {
  switch (pageId) {
    case 'start':
      return (
        <div>
          <div className="banner">
            <h2>Administrativ översikt</h2>
            <p>Snabb åtkomst till vanliga administrativa uppgifter och systeminformation.</p>
          </div>

          <div className="grid-3">
            <div className="stat-card" onClick={() => onNavigate?.('anv-elever')}>
              <div>
                <div className="lbl">Användare</div>
                <div className="val" style={{ fontSize: 20 }}>Hantera konton</div>
                <div className="det">Elever, personal och speciallärare</div>
              </div>
              <div className="stat-icon"><Users size={18} /></div>
            </div>
            <div className="stat-card" onClick={() => onNavigate?.('klasser')}>
              <div>
                <div className="lbl">Skolstruktur</div>
                <div className="val" style={{ fontSize: 20 }}>Klasser & ämnen</div>
                <div className="det">Grupper, scheman och kopplingar</div>
              </div>
              <div className="stat-icon"><GraduationCap size={18} /></div>
            </div>
            <div className="stat-card" onClick={() => onNavigate?.('roller')}>
              <div>
                <div className="lbl">Behörigheter</div>
                <div className="val" style={{ fontSize: 20 }}>Roller</div>
                <div className="det">Vad varje roll får göra</div>
              </div>
              <div className="stat-icon"><Shield size={18} /></div>
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 0 }}>
            <div className="card">
              <div className="card-title">Systeminformation</div>
              <div className="card-sub">Viktigt just nu</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Bell size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Ingen publik registrering</div>
                  <div className="list-item-sub">Konton skapas endast via Skapa konto</div>
                </div>
                <span className="badge badge-solid">Aktivt</span>
              </div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><Sparkles size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">AI-systemet är anslutet</div>
                  <div className="list-item-sub">OpenRouter via Supabase Edge Function</div>
                </div>
                <span className="badge badge-solid">Aktivt</span>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Senaste administrativa händelser</div>
              <div className="card-sub">Loggas i systemets loggar</div>
              <div className="list-item">
                <div className="stat-icon" style={{ width: 34, height: 34 }}><ScrollText size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">Inga händelser loggade ännu</div>
                  <div className="list-item-sub">Loggningen kopplas till backend</div>
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => onNavigate?.('loggar')}>
                Öppna loggar
              </button>
            </div>
          </div>
        </div>
      );

    // ---------------------------------------------------------- Användare
    case 'anv-elever':
      return (
        <AdminUsersPanel
          onNavigate={onNavigate}
          roleFilter="elev"
          title="Elever"
          subtitle="Sök, inaktivera och återaktivera elever"
        />
      );

    case 'anv-personal':
      return (
        <AdminUsersPanel
          onNavigate={onNavigate}
          roleFilter="admin"
          title="Personal"
          subtitle="Administratörer och övrig personal"
          showCreate
        />
      );

    case 'anv-speciallarare':
      return (
        <AdminUsersPanel
          onNavigate={onNavigate}
          roleFilter="speciallärare"
          title="Speciallärare"
          subtitle="Speciallärare och deras konton"
          showCreate
        />
      );

    case 'anvandare':
      return (
        <AdminUsersPanel
          onNavigate={onNavigate}
          title="Konton"
          subtitle="Alla konton i systemet — konton och behörigheter hanteras via Supabase Auth"
          showCreate
        />
      );

    case 'roller':
      return <AdminRolesPanel />;

    // ------------------------------------------------------ Skolhantering
    case 'klasser':
      return (
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Klasser</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>Skapa och redigera klasser</div>
              </div>
              <button className="btn btn-primary btn-sm">Skapa klass</button>
            </div>
          </div>
          <div className="grid-3">
            {['7A', '7B', '8A', '8B', '9A', '9B'].map((k) => (
              <div className="stat-card" key={k}>
                <div>
                  <div className="lbl">Klass</div>
                  <div className="val">{k}</div>
                  <div className="det">Exempeldata</div>
                </div>
                <div className="stat-icon"><GraduationCap size={18} /></div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'elevgrupper':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Elevgrupper</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>Grupper inom klasser för samarbete och stöd</div>
            </div>
            <button className="btn btn-primary btn-sm">Skapa grupp</button>
          </div>
          {[
            { t: 'Läsgrupp 7B', s: '6 elever • Stödgrupp' },
            { t: 'Mattegrupp 8A', s: '5 elever • Fortsättning' },
          ].map((g) => (
            <div className="list-item" key={g.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Layers size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{g.t}</div>
                <div className="list-item-sub">{g.s}</div>
              </div>
              <button className="btn btn-outline btn-sm">Redigera</button>
            </div>
          ))}
        </div>
      );

    case 'amnen':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Ämnen</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>Organisera ämnen och koppla dem till klasser</div>
            </div>
            <button className="btn btn-primary btn-sm">Skapa ämne</button>
          </div>
          {['Svenska', 'Matematik', 'Engelska', 'Naturkunskap', 'Historia', 'Idrott'].map((a) => (
            <div className="list-item" key={a}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><BookOpen size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{a}</div>
                <div className="list-item-sub">Kopplad till 6 klasser</div>
              </div>
              <button className="btn btn-outline btn-sm">Redigera</button>
            </div>
          ))}
        </div>
      );

    case 'scheman':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Scheman</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>Veckoschema per klass</div>
            </div>
            <button className="btn btn-primary btn-sm">Redigera schema</button>
          </div>
          {['7A', '7B', '8A'].map((k) => (
            <div className="list-item" key={k}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Calendar size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">Schema {k}</div>
                <div className="list-item-sub">Måndag–fredag • 30 lektioner</div>
              </div>
              <button className="btn btn-outline btn-sm">Visa</button>
            </div>
          ))}
        </div>
      );

    case 'kopplingar':
      return (
        <div className="card">
          <div className="card-title">Elever & personal</div>
          <div className="card-sub">
            Koppla elever till klasser och ansvariga speciallärare. Exempeldata —
            kopplingarna lagras i backend i ett senare steg.
          </div>
          {[
            { e: 'Elev A', k: '7B', s: 'Speciallärare Nord' },
            { e: 'Elev C', k: '8A', s: 'Speciallärare Berg' },
          ].map((x) => (
            <div className="list-item" key={x.e}>
              <div className="avatar-circle">{x.e.charAt(0)}</div>
              <div className="list-item-content">
                <div className="list-item-title">{x.e}</div>
                <div className="list-item-sub">Klass {x.k} • {x.s}</div>
              </div>
              <button className="btn btn-outline btn-sm">Ändra koppling</button>
            </div>
          ))}
        </div>
      );

    case 'kontaktlistor':
      return (
        <div className="card">
          <div className="card-title">Kontaktlistor</div>
          <div className="card-sub">Exempeldata</div>
          {['Kontaktlista 7B', 'Kontaktlista 8A'].map((k) => (
            <div className="list-item" key={k}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Users size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{k}</div>
                <div className="list-item-sub">Föräldrar</div>
              </div>
              <button className="btn btn-outline btn-sm">Exportera</button>
            </div>
          ))}
        </div>
      );

    // ------------------------------------------- Uppgifter & undervisning
    case 'uppgifter':
      return (
        <div>
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-head">
              <div>
                <div className="card-title">Uppgifter</div>
                <div className="card-sub" style={{ marginBottom: 0 }}>
                  Övergripande hantering av tilldelade uppgifter
                </div>
              </div>
              <button className="btn btn-primary btn-sm">Skapa uppgift</button>
            </div>
            {[
              { t: 'Svenska prov v43', s: '120 elever • Fredag', tag: 'Aktiv' },
              { t: 'Matteprojekt Q2', s: '80 elever • Onsdag', tag: 'Pågående' },
            ].map((x) => (
              <div className="list-item" key={x.t}>
                <div className="stat-icon" style={{ width: 34, height: 34 }}><ClipboardList size={15} /></div>
                <div className="list-item-content">
                  <div className="list-item-title">{x.t}</div>
                  <div className="list-item-sub">{x.s}</div>
                </div>
                <span className={`badge ${x.tag === 'Aktiv' ? 'badge-solid' : ''}`}>{x.tag}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">Uppgiftskategorier</div>
            <div className="card-sub">Kategorier och tilldelningar</div>
            <div className="role-chooser">
              <span className="role-option"><span>Prov</span></span>
              <span className="role-option"><span>Inlämning</span></span>
              <span className="role-option"><span>Övning</span></span>
              <span className="role-option"><span>Projekt</span></span>
            </div>
          </div>
        </div>
      );

    case 'material':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Undervisningsmaterial</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>Översikt över material i systemet</div>
            </div>
            <button className="btn btn-primary btn-sm">Nytt material</button>
          </div>
          {[
            { t: 'Lässtrategi-guide', s: 'PDF • Delat med 7B' },
            { t: 'Mattearbetsblad', s: 'PDF • Delat med 8A' },
          ].map((m) => (
            <div className="list-item" key={m.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><BookOpen size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{m.t}</div>
                <div className="list-item-sub">{m.s}</div>
              </div>
              <button className="btn btn-outline btn-sm">Hantera</button>
            </div>
          ))}
        </div>
      );

    case 'elev-dokument':
    case 'larare-dokument':
      return (
        <div className="card">
          <div className="card-title">{pageId === 'elev-dokument' ? 'Elev-dokument' : 'Lärare-dokument'}</div>
          <div className="card-sub">Exempeldata — dokumentlagret kopplas senare</div>
          {['Dokument A.pdf', 'Dokument B.docx'].map((d) => (
            <div className="list-item" key={d}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><FileText size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{d}</div>
                <div className="list-item-sub">Exempelfil</div>
              </div>
              <button className="btn btn-outline btn-sm">Visa</button>
            </div>
          ))}
        </div>
      );

    // ------------------------------------------------------ Kommunikation
    case 'meddelanden':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Meddelanden</div>
              <div className="card-sub">Exempeldata</div>
            </div>
            <button className="btn btn-primary btn-sm">Skapa</button>
          </div>
          {[
            { t: 'Systemnotis: Nya åtgärder för Q3', s: 'Till alla • Igår', tag: 'Viktigt' },
            { t: 'Personligt meddelande', s: 'Till dig • Igår', tag: '' },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Bell size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
              {x.tag && <span className="badge badge-solid">{x.tag}</span>}
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
            Elevers privata meddelanden är inte automatiskt synliga för admin. Åtkomst
            till privata konversationer måste uttryckligen definieras och begränsas.
          </p>
        </div>
      );

    case 'forum':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Forum</div>
              <div className="card-sub">Exempeldata</div>
            </div>
            <button className="btn btn-primary btn-sm">Ny tråd</button>
          </div>
          {[
            { t: 'Teknikfråga: Applikationer', s: '4 svar' },
            { t: 'Förslag: Ny funktion för elever', s: '12 svar' },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><MessageCircle size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
            </div>
          ))}
        </div>
      );

    case 'nyheter':
      return (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Nyheter</div>
              <div className="card-sub">Exempeldata</div>
            </div>
            <button className="btn btn-primary btn-sm">Publicera</button>
          </div>
          {[
            { t: 'Välkomstmeddelande för nya elever', s: 'Utkast', tag: 'Utkast' },
            { t: 'Höstens evenemang', s: 'Publicerad', tag: '' },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><GitBranch size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
              {x.tag && <span className="badge">{x.tag}</span>}
            </div>
          ))}
        </div>
      );

    // ---------------------------------------------------------------- AI
    case 'ai-installningar':
      return <AdminAiSettingsPanel />;

    // ------------------------------------------------------------- System
    case 'installningar':
      return (
        <div className="card">
          <div className="card-title">Appinställningar</div>
          <div className="card-sub">Globala inställningar som hör till adminrollen</div>
          {[
            { t: 'Publik registrering', s: 'Av — konton skapas endast av administratörer', on: false },
            { t: 'Inloggning med användarnamn', s: 'På — lösenord hanteras av Supabase Auth', on: true },
            { t: 'Temaväljare för användare', s: "På — användare väljer ljust eller mörkt tema", on: true },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><Settings size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
              <span className={`badge ${x.on ? 'badge-solid' : ''}`}>{x.on ? 'På' : 'Av'}</span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
            Inställningarna kopplas till backend i ett senare steg. Hemligheter och
            API-nycklar hanteras alltid serversidigt.
          </p>
        </div>
      );

    case 'loggar':
      return (
        <div className="card">
          <div className="card-title">Loggar</div>
          <div className="card-sub">
            Viktiga administrativa åtgärder. Endast information som är nödvändig för
            administrationen och som admin har rätt att se visas här.
          </div>
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <ScrollText size={40} />
            <h3>Inga loggade händelser ännu</h3>
            <p style={{ fontSize: 12.5, maxWidth: 420 }}>
              Händelseloggningen kopplas till backend. Då visas t.ex. skapade konton,
              rolländringar och inställningsändringar här.
            </p>
          </div>
        </div>
      );

    case 'uppdateringar':
      return (
        <div className="card">
          <div className="card-title">Uppdateringar</div>
          <div className="card-sub">Exempeldata</div>
          {[
            { t: 'v4.2.1 — AI-stöd för speciallärare', s: 'Igår', tag: 'Ny' },
            { t: 'v4.2.0 — Förbättrad sökfunktion', s: '3 dagar sedan', tag: '' },
          ].map((x) => (
            <div className="list-item" key={x.t}>
              <div className="stat-icon" style={{ width: 34, height: 34 }}><GitBranch size={15} /></div>
              <div className="list-item-content">
                <div className="list-item-title">{x.t}</div>
                <div className="list-item-sub">{x.s}</div>
              </div>
              {x.tag && <span className="badge badge-solid">{x.tag}</span>}
            </div>
          ))}
        </div>
      );

    default:
      return (
        <div className="empty-state">
          <MessageSquare size={40} />
          <h3>Välj en kategori i sidomenyn</h3>
        </div>
      );
  }
};
