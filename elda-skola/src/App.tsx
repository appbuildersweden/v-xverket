import { useCallback, useEffect, useMemo, useState } from 'react';
import { LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/auth';
import { Login } from './components/Login';
import { ForcePassword } from './components/ForcePassword';
import { ADMIN_NAV, AppShell, ELEV_NAV, LARARE_NAV, type PanelKind } from './components/AppShell';
import { AdminPanel } from './pages/admin/AdminPanel';
import { Button } from './components/ui';
import { defaultStartPage } from './lib/settings';
import {
  ElevAmnen,
  ElevFramsteg,
  ElevHem,
  ElevKalender,
  ElevKlass,
  ElevMeddelanden,
  ElevUppgifter,
} from './pages/elev';
import {
  LarareAktiviteter,
  LarareAnpassningar,
  LarareInlamningar,
  LarareKalender,
  LarareKlasser,
  LarareMaterial,
  LarareMeddelanden,
  LarareOversikt,
  LarareUppgifter,
} from './pages/larare';
import { Profil } from './pages/Profil';

interface Route {
  panel: PanelKind;
  page: string;
}

function parseRoute(hash: string): Route | null {
  const match = /^#\/(elev|larare|admin)\/([a-z-]+)$/.exec(hash);
  if (!match) return null;
  return { panel: match[1] as PanelKind, page: match[2] };
}

function Splash() {
  return (
    <div className="splash">
      <img src="elda-icon.png" alt="" />
      <strong>Elda Skola</strong>
      <span>Laddar…</span>
    </div>
  );
}

function Denied({ reason }: { reason: string | null }) {
  const { logout, identity } = useAuth();
  return (
    <div className="deny-wrap">
      <div className="deny-card">
        <span className="eyebrow">Elda Skola</span>
        <h1>Skolkontot har inte åtkomst</h1>
        <p>
          {reason ??
            'Det här kontot har ingen skolroll i Elda Skola. Logga in med ett lärar- eller skolelevskonto.'}
        </p>
        {identity && (
          <p className="small muted">
            Inloggad som <strong>{identity.username}</strong>
            {identity.role !== 'okand' ? ` (${identity.role})` : ''}.
          </p>
        )}
        <div className="row" style={{ marginTop: 18 }}>
          <Button variant="primary" icon={<LogOut size={16} />} onClick={() => void logout()}>
            Logga ut
          </Button>
          <Button variant="ghost" onClick={() => window.location.assign('/')}>
            Till startsidan
          </Button>
        </div>
      </div>
    </div>
  );
}

function SchoolApp() {
  const { access, identity, profile, logout } = useAuth();
  const panel: PanelKind = access === 'teacher' ? 'larare' : identity?.role === 'admin' ? 'admin' : 'elev';

  const [route, setRoute] = useState<Route>(() => {
    const parsed = typeof window === 'undefined' ? null : parseRoute(window.location.hash);
    if (parsed && parsed.panel === panel) return parsed;
    return { panel, page: defaultStartPage(panel) };
  });

  // Rollen äger panelen. En elev kan aldrig nå lärarpanelen genom att ändra
  // adressen, och tvärtom.
  const validPage = useMemo(() => {
    const nav = route.panel === 'larare' ? LARARE_NAV : route.panel === 'admin' ? ADMIN_NAV : ELEV_NAV;
    return nav.some((item) => item.id === route.page);
  }, [route]);

  useEffect(() => {
    if (route.panel !== panel || !validPage) {
      setRoute({ panel, page: defaultStartPage(panel) });
    }
  }, [panel, route.panel, validPage]);

  const navigate = useCallback(
    (page: string) => {
      const next = { panel, page };
      setRoute(next);
      const hash = `#/${next.panel}/${next.page}`;
      if (window.location.hash !== hash) {
        window.history.replaceState(null, '', hash);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [panel],
  );

  useEffect(() => {
    const apply = () => {
      const parsed = parseRoute(window.location.hash);
      if (!parsed) return;
      if (parsed.panel !== panel) {
        navigate(defaultStartPage(panel));
        return;
      }
      const nav = parsed.panel === 'larare' ? LARARE_NAV : parsed.panel === 'admin' ? ADMIN_NAV : ELEV_NAV;
      if (!nav.some((item) => item.id === parsed.page)) {
        navigate(defaultStartPage(panel));
        return;
      }
      setRoute(parsed);
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [panel, navigate]);

  if (!identity) return null;

  const page = route.panel === panel && validPage ? route.page : defaultStartPage(panel);

  const content = (() => {
    if (page === 'profil') {
      return <Profil panel={panel} onNavigate={navigate} />;
    }
    if (panel === 'admin') {
      return <AdminPanel activePage={page} onNavigate={navigate} />;
    }
    if (panel === 'larare') {
      switch (page) {
        case 'oversikt':
          return <LarareOversikt onNavigate={navigate} />;
        case 'uppgifter':
          return <LarareUppgifter />;
        case 'aktiviteter':
          return <LarareAktiviteter />;
        case 'material':
          return <LarareMaterial />;
        case 'klasser':
          return <LarareKlasser />;
        case 'kalender':
          return <LarareKalender />;
        case 'meddelanden':
          return <LarareMeddelanden />;
        case 'inlamningar':
          return <LarareInlamningar />;
        case 'anpassningar':
          return <LarareAnpassningar />;
        default:
          return <LarareOversikt onNavigate={navigate} />;
      }
    }
    switch (page) {
      case 'hem':
        return <ElevHem onNavigate={navigate} />;
      case 'uppgifter':
        return <ElevUppgifter />;
      case 'amnen':
        return <ElevAmnen />;
      case 'kalender':
        return <ElevKalender />;
      case 'klass':
        return <ElevKlass />;
      case 'meddelanden':
        return <ElevMeddelanden />;
      case 'framsteg':
        return <ElevFramsteg />;
      default:
        return <ElevHem onNavigate={navigate} />;
    }
  })();

  return (
    <AppShell
      panel={panel}
      activePage={page}
      onNavigate={navigate}
      identity={identity}
      profile={profile}
      onLogout={() => void logout()}
    >
      {content}
    </AppShell>
  );
}

function Root() {
  const { loading, identity, access, denialReason } = useSchoolAuth();

  if (loading) return <Splash />;
  if (!identity) return <Login />;
  if (identity.mustChangePassword) return <ForcePassword />;
  if (access === 'denied' && !(identity.role === 'admin' && identity.active)) return <Denied reason={denialReason} />;
  return <SchoolApp />;
}

// Liten hjälp så att Root bara läser det den behöver och TypeScript ser fältet.
function useSchoolAuth() {
  const auth = useAuth();
  return { ...auth, mustSetNewPassword: auth.identity?.mustChangePassword === true };
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
