import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from './router';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { getDefaultPanelForRole } from './lib/auth-types';
import { Sidebar, PanelType } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Login } from './pages/Login';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { Profil } from './pages/Profil';
import { ElevPanel } from './pages/ElevPanel';
import { SpeciallararPanel } from './pages/SpeciallararPanel';
import { AdminPanel } from './pages/AdminPanel';
import { AiChatPage } from './pages/AiChatPage';
import { Router } from './router';
import { UpdateBanner } from './components/UpdateBanner';

const firstPage: Record<PanelType, string> = {
  elev: 'start',
  speciallarar: 'hem',
  admin: 'start',
};

const navLabels: Record<string, Partial<Record<PanelType, string>>> = {
  // Gemensamt / elev
  start: { elev: 'Översikt', admin: 'Översikt' },
  planering: { elev: 'Min planering', speciallarar: 'Planering & att göra' },
  amnen: { elev: 'Mina ämnen', admin: 'Ämnen' },
  uppgifter: { elev: 'Uppgifter', admin: 'Uppgifter' },
  'ai-hjalp': { elev: 'AI-studiehjälp' },
  klass: { elev: 'Klassinformation' },
  kamrater: { elev: 'Klasskamrater' },
  klasschatt: { elev: 'Klasschatt' },
  dokument: { elev: 'Mina dokument' },
  framsteg: { elev: 'Mina framsteg' },
  flashcards: { elev: 'Flashcards & repetition' },
  provtraning: { elev: 'Provträning' },
  meddelanden: { admin: 'Meddelanden' },
  forum: { admin: 'Forum' },
  belonningar: { elev: 'Belöningar & nivåer', speciallarar: 'Belöningar & upplåsningar' },
  hem: { speciallarar: 'Hem' },
  elever: { speciallarar: 'Mina elever' },
  'meddelande-elever': { speciallarar: 'Meddelande-elever' },
  'global-chatt': { speciallarar: 'Global chatt' },
  'private-chattar': { speciallarar: 'Privata chattar' },
  'ai-assistent': { speciallarar: 'AI-assistent' },
  material: { speciallarar: 'Undervisningsmaterial', admin: 'Undervisningsmaterial' },
  uppföljning: { speciallarar: 'Uppgifter & uppföljning' },
  uppdateringar: { admin: 'Uppdateringar' },
  anvandare: { admin: 'Användare och konton' },
  'anv-elever': { admin: 'Elever' },
  'anv-personal': { admin: 'Personal' },
  'anv-speciallarare': { admin: 'Speciallärare' },
  roller: { admin: 'Roller och behörigheter' },
  'create-user': { admin: 'Skapa konto' },
  lararkontakter: { admin: 'Lärarkontakter' },
  'ai-chat': { admin: 'AI-chat' },
  'ai-installningar': { admin: 'AI-inställningar' },
  installningar: { admin: 'Appinställningar' },
  loggar: { admin: 'Loggar' },
  'elev-dokument': { admin: 'Elev-dokument' },
  'larare-dokument': { admin: 'Lärare-dokument' },
  klasser: { admin: 'Klasser' },
  elevgrupper: { admin: 'Elevgrupper' },
  scheman: { admin: 'Scheman' },
  kopplingar: { admin: 'Elever & personal' },
  kontaktlistor: { admin: 'Kontaktlistor' },
  nyheter: { admin: 'Nyheter och uppdateringar' },
};

function getPageTitle(activePanel: PanelType, activePage: string): string {
  const fallback: Record<PanelType, string> = {
    elev: 'Elda',
    speciallarar: 'Speciallärare',
    admin: 'Admin',
  };
  return (navLabels[activePage] && navLabels[activePage][activePanel]) ?? fallback[activePanel] ?? '';
}

function AppContent() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const initRef = useRef(false);

  // När användaren loggas in eller ut måste vi sätta panelen korrekt
  // och hantera omdirigering.
  useEffect(() => {
    if (!session?.exists || !user) return;
    if (initRef.current) return;
    initRef.current = true;

    // Första gången en inloggad användare laddar: sätt panel från rollen
    const defaultPanel = getDefaultPanelForRole(user.role);
    navigate.setActivePanel(defaultPanel);
    navigate.setActivePage(firstPage[defaultPanel]);
    navigate.hideLogin();
  }, [session?.exists, user, navigate]);

  const activePanel = navigate.getActivePanel();
  const activePage = navigate.getActivePage();
  // Panelen är gemensam för lärare och speciallärare — etiketten visar kontots roll.
  const roleLabel =
    user?.role === 'lärare'
      ? 'Lärare'
      : user?.role === 'speciallärare'
        ? 'Speciallärare'
        : user?.role === 'admin'
          ? 'Administratör'
          : 'Elev';
  const showProfile = activePage === '__profil';

  const title = showProfile
    ? 'Profil & inställningar'
    : getPageTitle(activePanel, activePage);

  const handleNavigate = useCallback(
    (pageId: string) => {
      navigate.setActivePage(pageId);
      navigate.setShowProfile(false);
    },
    [navigate],
  );



  const handleOpenProfile = useCallback(() => {
    navigate.setShowProfile(true);
  }, [navigate]);

  const handleCloseProfile = useCallback(() => {
    navigate.setShowProfile(false);
  }, [navigate]);

  // panelLabels och firstPage används i renderningen nedan

  const isSessionLoading = session === null;

  if (isSessionLoading) {
    return null;
  }

  if (!session?.exists || !user) {
    // Ej inloggad: visa login
    return <Login />;
  }

  // Tvingat lösenordsbyte blockerar hela appen. Inget annat renderas — panelerna
  // och sidomenyn finns inte ens i trädet, så steget kan inte kringgås genom att
  // navigera till en annan sida. Servern nollar flaggan (och AI-tjänsten nekar
  // dessutom anrop) först när lösenordet är bytt.
  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  // AI-chattens sida (renderas av AiChatPage för respektive roll)
  const isChatPage =
    (activePanel === 'elev' && activePage === 'ai-hjalp') ||
    (activePanel === 'speciallarar' && activePage === 'ai-assistent') ||
    (activePanel === 'admin' && activePage === 'ai-chat');

  // Inloggad: visa app
  const renderContent = () => {
    if (showProfile) {
      return <Profil role={activePanel} onClose={handleCloseProfile} />;
    }
    if (isChatPage) return <AiChatPage panel={activePanel} />;
    if (activePanel === 'elev') return <ElevPanel pageId={activePage} />;
    if (activePanel === 'speciallarar') {
      return (
        <SpeciallararPanel
          pageId={activePage}
          role={user.role === 'lärare' ? 'lärare' : 'speciallärare'}
        />
      );
    }
    if (activePanel === 'admin') {
      return <AdminPanel pageId={activePage} onNavigate={handleNavigate} />;
    }
    // Okänd panel — visa AdminPanel som fallback med right pageId
    return <AdminPanel pageId={activePage} onNavigate={handleNavigate} />;
  };

  return (
    <div className="app-layout">
      <Sidebar
        panel={activePanel}
        activePage={showProfile ? '__profil' : activePage}
        onNavigate={handleNavigate}
        onOpenProfile={handleOpenProfile}
        // Lärarnas meny styrs av valen som sparades vid registreringen (och som
        // kan ändras i profilen). Admin och elev skickar undefined.
        features={
          user.role === 'lärare' || user.role === 'speciallärare'
            ? user.features ?? []
            : undefined
        }
      />
      <div className="main-col">
        <TopBar role={activePanel} onOpenProfile={handleOpenProfile} />
        <div className="page-head">
          <h1>{title}</h1>
          <div className="breadcrumb">
            <b>Elda</b>
            <span>•</span>
            <span>{roleLabel}</span>
            <span>•</span>
            <span>{title}</span>
          </div>
        </div>
        <div className={isChatPage ? 'content content--flush' : 'content'}>
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
      {/* Ligger utanför panelerna så att uppdateringar upptäckts även på
          inloggningsskärmen och i alla roller. */}
      <UpdateBanner />
    </AuthProvider>
  );
}

export default App;;
