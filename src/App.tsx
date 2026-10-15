import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from './router';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { getDefaultPanelForRole, isAdmin } from './lib/auth-types';
import { Sidebar, PanelType } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Login } from './pages/Login';
import { Profil } from './pages/Profil';
import { ElevPanel } from './pages/ElevPanel';
import { SpeciallararPanel } from './pages/SpeciallararPanel';
import { AdminPanel } from './pages/AdminPanel';
import { AdminCreateUserPage } from './pages/AdminCreateUserPage';
import { AiChatPage } from './pages/AiChatPage';
import { Router } from './router';

const panelLabels: Record<PanelType, string> = {
  elev: 'Elev',
  speciallarar: 'Speciallärare',
  admin: 'Admin',
};

const firstPage: Record<PanelType, string> = {
  elev: 'start',
  speciallarar: 'hem',
  admin: 'start',
};

const navLabels: Record<string, Partial<Record<PanelType, string>>> = {
  // Gemensamt / elev
  start: { elev: 'Översikt', admin: 'Administrativ översikt' },
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
  anvandare: { admin: 'Konton' },
  'anv-elever': { admin: 'Elever' },
  'anv-personal': { admin: 'Personal' },
  'anv-speciallarare': { admin: 'Speciallärare' },
  roller: { admin: 'Roller och behörigheter' },
  'create-user': { admin: 'Skapa konto' },
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
  nyheter: { admin: 'Nyheter' },
};

function getPageTitle(activePanel: PanelType, activePage: string): string {
  const fallback: Record<PanelType, string> = {
    elev: 'Växverket',
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

  const handleSwitchPanel = useCallback(
    (panel: PanelType) => {
      // En användare kan inte växla till en panel de inte har behörighet till
      if (user && !['elev', 'speciallarar', 'admin'].includes(panel)) return;
      if (user && !isAdmin(user) && panel !== getDefaultPanelForRole(user.role)) {
        // Ej admin får inte växla panel — ignoreras
        return;
      }
      navigate.setActivePanel(panel);
      navigate.setActivePage(firstPage[panel]);
      navigate.setShowProfile(false);
    },
    [user, navigate],
  );

  const handleOpenProfile = useCallback(() => {
    navigate.setShowProfile(true);
  }, [navigate]);

  const handleCloseProfile = useCallback(() => {
    navigate.setShowProfile(false);
  }, [navigate]);

  const isSessionLoading = session === null;

  if (isSessionLoading) {
    return null;
  }

  if (!session?.exists || !user) {
    // Ej inloggad: visa login
    return <Login />;
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
    if (activePanel === 'speciallarar') return <SpeciallararPanel pageId={activePage} />;
    if (activePanel === 'admin') {
      // Admin-sidor
      if (activePage === 'create-user') {
        return <AdminCreateUserPage />;
      }
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
        onSwitchPanel={handleSwitchPanel}
        onOpenProfile={handleOpenProfile}
      />
      <div className="main-col">
        <TopBar role={activePanel} onOpenProfile={handleOpenProfile} />
        <div className="page-head">
          <h1>{title}</h1>
          <div className="breadcrumb">
            <b>Växverket</b>
            <span>•</span>
            <span>{panelLabels[activePanel]}</span>
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
    </AuthProvider>
  );
}

export default App;;
