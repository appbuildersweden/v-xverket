import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { Router, useNavigate } from './router';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { PageHeader } from './components/PageHeader';
import { Login } from './pages/Login';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { Profil } from './pages/Profil';
import { ElevPanel } from './pages/ElevPanel';
import { PrivatelevPanel } from './pages/PrivatelevPanel';
import { LararePanel } from './pages/LararePanel';
import { SpeciallararPanel } from './pages/SpeciallararPanel';
import { AdminPanel } from './pages/AdminPanel';
import { Panel } from './lib/auth-types';
import { defaultRoute, resolveRoute, routeToRender, type Route } from './lib/guards';
import { formatHashRoute, parseHashRoute } from './lib/hash-route';
import { PANEL_LABELS, categoryForPage, labelForPage } from './lib/nav';

/**
 * Rutten speglas i adressfältets hash (#/panel/sida) så att en inklistrad
 * adress hamnar i exakt samma behörighetskontroll som all annan navigering.
 */
function useHashSync(
  target: Route | null,
  routeHash: string,
  setRoute: (r: Route) => void,
  markFromAddressBar: () => void,
) {
  useEffect(() => {
    const apply = () => {
      const parsed = parseHashRoute(window.location.hash);
      if (parsed) {
        markFromAddressBar();
        setRoute(parsed);
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRoute]);

  // Endast en rutt som faktiskt visas speglas i adressfältet. Är användaren
  // utloggad (eller nekad) rör vi inte adressen, så en delad djup länk finns
  // kvar genom inloggningen i stället för att skrivas över.
  //
  // Beroendet är den färdiga adressen, inte ruttobjektet: objektet är nytt vid
  // varje rendering, och skrev vi då tillbaka adressen skulle en adress som
  // just skrivits in kunna skrivas över innan webbläsaren hinner lämna sin
  // hashchange-händelse — då tappas den nya adressen utan förklaring.
  const targetHash = target ? formatHashRoute(target) : null;
  useEffect(() => {
    if (!targetHash) return;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, '', targetHash);
    }
    // `routeHash` ingår så att adressen rättas även när en nekad adress har
    // skickat användaren tillbaka till samma sida som förut.
  }, [targetHash, routeHash]);
}

function AccessDenied({ reason }: { reason: string }) {
  const { logout } = useAuth();
  return (
    <div className="deny-wrap" role="alert" data-testid="access-denied">
      <div className="card">
        <div className="card-head">
          <h2 className="card-title">
            <ShieldAlert size={18} /> Åtkomst nekad
          </h2>
        </div>
        <p className="card-sub">{reason}</p>
        <button type="button" className="btn btn-outline" onClick={() => void logout()}>
          <LogOut size={16} /> Logga ut
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, session } = useAuth();
  const nav = useNavigate();
  const [showProfile, setShowProfile] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  // Sant när den aktuella rutten kom från adressfältet (en inklistrad eller
  // delad adress). Bara då är omdirigeringsbeskedet relevant: efter en vanlig
  // inloggning är appens egen startrutt ingen felaktig panel, och eleven ska
  // inte mötas av ett felmeddelande första gången panelen visas.
  const fromAddressBar = useRef(
    typeof window === 'undefined' ? false : parseHashRoute(window.location.hash) !== null,
  );
  const markFromAddressBar = useCallback(() => {
    fromAddressBar.current = true;
  }, []);

  const route: Route = { panel: nav.panel, page: nav.page };

  // Rollen från servern avgör hela vyn. Ruttvakten prövas vid varje rendering —
  // ingen panel, ingen sida och ingen hash-adress går förbi den.
  const decision = resolveRoute(user, route);
  const target = routeToRender(decision);
  const routeKey = `${route.panel}/${route.page}`;
  const targetKey = target ? `${target.panel}/${target.page}` : null;
  const redirectReason = decision.kind === 'redirect' ? decision.reason : null;

  // Vid inloggning (eller ny roll) startar användaren i sin egen panels
  // startsida — men en giltig djup länk (#/panel/sida) från start ska respekteras,
  // så att en direktöppnad adress inte tappas. Ruttvakten prövar den ändå.
  const userKey = user ? `${user.id}:${user.role}` : null;
  const previousUserKey = useRef<string | null>(null);
  const startHashRoute = useRef<Route | null>(
    typeof window === 'undefined' ? null : parseHashRoute(window.location.hash),
  );
  useEffect(() => {
    if (previousUserKey.current === userKey) return;
    const firstSession = previousUserKey.current === null;
    previousUserKey.current = userKey;

    if (!user) {
      // Utloggad: nästa inloggning ska inte ärva en gammal adress.
      startHashRoute.current = null;
      setSidebarOpen(false);
      return;
    }

    const deepLink = startHashRoute.current;
    startHashRoute.current = null;
    if (firstSession && deepLink) return;

    nav.setRoute(defaultRoute(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  // Normalisera tillståndet så fort den begärda rutten inte är tillåten.
  useEffect(() => {
    if (!targetKey || targetKey === routeKey) return;
    const [panel, page] = targetKey.split('/');
    nav.setRoute({ panel: panel as Panel, page });
    if (redirectReason && fromAddressBar.current) setNotice(redirectReason);
    fromAddressBar.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey, routeKey, redirectReason]);

  const syncRoute = useCallback((next: Route) => nav.setRoute(next), [nav.setRoute]);
  useHashSync(target, formatHashRoute(route), syncRoute, markFromAddressBar);

  const handleNavigate = useCallback(
    (pageId: string) => {
      setShowProfile(false);
      // Menyfiltret nollställs vid navigering så att hela menyn syns igen, och
      // ett besked om en nekad adress försvinner när användaren går vidare.
      setNavQuery('');
      setNotice(null);
      // Klick i menyn är ingen felaktig adress — inget omdirigeringsbesked.
      fromAddressBar.current = false;
      nav.setPage(pageId);
    },
    [nav],
  );

  const handleOpenProfile = useCallback(() => setShowProfile(true), []);
  const handleCloseProfile = useCallback(() => setShowProfile(false), []);

  if (session === null) return null; // Startar — AuthProvider visar laddningsvyn.
  if (!user || !session?.exists) return <Login />;

  if (decision.kind === 'deny') return <AccessDenied reason={decision.reason} />;

  // Tvingat lösenordsbyte blockerar hela appen. Panelerna och menyn finns inte
  // ens i trädet, så steget kan inte kringgås genom att navigera eller ladda om.
  if (user.mustChangePassword) return <ChangePasswordPage />;

  const activeRoute = target ?? route;
  const pageTitle = showProfile
    ? 'Profil och inställningar'
    : (labelForPage(activeRoute.panel, activeRoute.page) ?? PANEL_LABELS[activeRoute.panel]);
  const pageGroup = showProfile ? null : categoryForPage(activeRoute.panel, activeRoute.page)?.label;

  const renderContent = () => {
    if (showProfile) return <Profil panel={activeRoute.panel} onClose={handleCloseProfile} />;
    if (activeRoute.panel === 'elev') {
      return <ElevPanel pageId={activeRoute.page} onNavigate={handleNavigate} />;
    }
    if (activeRoute.panel === 'privat') {
      return <PrivatelevPanel pageId={activeRoute.page} onNavigate={handleNavigate} />;
    }
    if (activeRoute.panel === 'larare') {
      return <LararePanel pageId={activeRoute.page} onNavigate={handleNavigate} />;
    }
    if (activeRoute.panel === 'speciallarar') {
      return <SpeciallararPanel pageId={activeRoute.page} onNavigate={handleNavigate} />;
    }
    return <AdminPanel pageId={activeRoute.page} onNavigate={handleNavigate} />;
  };

  return (
    <div className="app-layout" data-testid="app-shell" data-panel={activeRoute.panel}>
      <Sidebar
        panel={activeRoute.panel}
        activePage={showProfile ? '__profil' : activeRoute.page}
        onNavigate={handleNavigate}
        onOpenProfile={handleOpenProfile}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filter={navQuery}
      />
      <div className="main-col">
        <TopBar
          panel={activeRoute.panel}
          onOpenProfile={handleOpenProfile}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          navQuery={navQuery}
          onNavQuery={setNavQuery}
        />
        <PageHeader
          panel={activeRoute.panel}
          title={pageTitle}
          group={pageGroup}
          subtitle={showProfile ? 'Ditt konto, utseende och session' : undefined}
        />
        <div className="content">
          {notice && (
            <div className="chat-notice" role="status" data-testid="route-notice">
              {notice} Du skickades till din egen panel.
            </div>
          )}
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
