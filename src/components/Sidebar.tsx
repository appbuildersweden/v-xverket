import React, { useEffect, useState } from 'react';
import {
  Home,
  Calendar,
  CheckSquare,
  Brain,
  Users,
  MessageSquare,
  MessageCircle,
  FileText,
  Award,
  Zap,
  User,
  BookOpen,
  Globe,
  Circle,
  Sparkles,
  ClipboardList,
  Shield,
  Bell,
  GitBranch,
  ChevronRight,
  UserPlus,
  GraduationCap,
  Layers,
  Settings,
  ScrollText,
  History,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export type PanelType = 'elev' | 'speciallarar' | 'admin';

interface NavItemDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

/** En huvudkategori i menyn med tillhörande undersidor. */
interface NavCategoryDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItemDef[];
}

interface SidebarProps {
  panel: PanelType;
  activePage: string;
  onNavigate: (pageId: string) => void;
  onSwitchPanel: (panel: PanelType) => void;
  onOpenProfile: () => void;
}

// ----------------------------------------------------------------
// Elevens kategorier
// ----------------------------------------------------------------

const ELEV_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'elev-hem',
    label: 'Hem',
    icon: <Home size={15} />,
    items: [{ id: 'start', label: 'Översikt', icon: <Home size={17} /> }],
  },
  {
    id: 'elev-skolarbete',
    label: 'Mitt skolarbete',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'planering', label: 'Min planering', icon: <Calendar size={17} /> },
      { id: 'amnen', label: 'Mina ämnen', icon: <BookOpen size={17} /> },
      { id: 'uppgifter', label: 'Uppgifter', icon: <CheckSquare size={17} /> },
      { id: 'dokument', label: 'Mina dokument', icon: <FileText size={17} /> },
    ],
  },
  {
    id: 'elev-plugg',
    label: 'Plugg-hjälp',
    icon: <Brain size={15} />,
    items: [{ id: 'ai-hjalp', label: 'AI-studiehjälp', icon: <Sparkles size={17} /> }],
  },
  {
    id: 'elev-traning',
    label: 'Träning och framsteg',
    icon: <Zap size={15} />,
    items: [
      { id: 'flashcards', label: 'Flashcards & repetition', icon: <Layers size={17} /> },
      { id: 'provtraning', label: 'Provträning', icon: <ClipboardList size={17} /> },
      { id: 'framsteg', label: 'Mina framsteg', icon: <Award size={17} /> },
      { id: 'belonningar', label: 'Belöningar & nivåer', icon: <Award size={17} /> },
    ],
  },
  {
    id: 'elev-klass',
    label: 'Min klass',
    icon: <Users size={15} />,
    items: [
      { id: 'klass', label: 'Klassinformation', icon: <Users size={17} /> },
      { id: 'kamrater', label: 'Klasskamrater', icon: <Users size={17} /> },
      { id: 'klasschatt', label: 'Klasschatt', icon: <MessageCircle size={17} /> },
    ],
  },
];

// ----------------------------------------------------------------
// Speciallärarens kategorier
// ----------------------------------------------------------------

const SPECIALLARAR_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'spec-hem',
    label: 'Hem',
    icon: <Home size={15} />,
    items: [{ id: 'hem', label: 'Hem', icon: <Home size={17} /> }],
  },
  {
    id: 'spec-elever',
    label: 'Elever',
    icon: <Users size={15} />,
    items: [
      { id: 'elever', label: 'Mina elever', icon: <Users size={17} /> },
      { id: 'meddelande-elever', label: 'Meddelande-elever', icon: <MessageSquare size={17} /> },
    ],
  },
  {
    id: 'spec-undervisning',
    label: 'Undervisning',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'material', label: 'Undervisningsmaterial', icon: <BookOpen size={17} /> },
      { id: 'uppföljning', label: 'Uppgifter & uppföljning', icon: <ClipboardList size={17} /> },
      { id: 'planering', label: 'Planering & att göra', icon: <Calendar size={17} /> },
    ],
  },
  {
    id: 'spec-kommunikation',
    label: 'Kommunikation',
    icon: <MessageCircle size={15} />,
    items: [
      { id: 'global-chatt', label: 'Global chatt', icon: <Globe size={17} /> },
      { id: 'private-chattar', label: 'Privata chattar', icon: <Circle size={17} /> },
    ],
  },
  {
    id: 'spec-utveckling',
    label: 'Utveckling',
    icon: <Award size={15} />,
    items: [{ id: 'belonningar', label: 'Belöningar & upplåsningar', icon: <Award size={17} /> }],
  },
  {
    id: 'spec-ai',
    label: 'AI-stöd',
    icon: <Sparkles size={15} />,
    items: [{ id: 'ai-assistent', label: 'AI-assistent', icon: <Sparkles size={17} /> }],
  },
];

// ----------------------------------------------------------------
// Administratörens kategorier
// ----------------------------------------------------------------

const ADMIN_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'adm-hem',
    label: 'Startsida',
    icon: <Home size={15} />,
    items: [{ id: 'start', label: 'Administrativ översikt', icon: <Home size={17} /> }],
  },
  {
    id: 'adm-anvandare',
    label: 'Användare',
    icon: <Users size={15} />,
    items: [
      { id: 'anv-elever', label: 'Elever', icon: <Users size={17} /> },
      { id: 'anv-personal', label: 'Personal', icon: <Users size={17} /> },
      { id: 'anv-speciallarare', label: 'Speciallärare', icon: <Users size={17} /> },
      { id: 'anvandare', label: 'Konton', icon: <UserPlus size={17} /> },
      { id: 'create-user', label: 'Skapa konto', icon: <UserPlus size={17} /> },
    ],
  },
  {
    id: 'adm-roller',
    label: 'Roller & behörigheter',
    icon: <Shield size={15} />,
    items: [{ id: 'roller', label: 'Roller och behörigheter', icon: <Shield size={17} /> }],
  },
  {
    id: 'adm-skola',
    label: 'Skolhantering',
    icon: <GraduationCap size={15} />,
    items: [
      { id: 'klasser', label: 'Klasser', icon: <GraduationCap size={17} /> },
      { id: 'elevgrupper', label: 'Elevgrupper', icon: <Layers size={17} /> },
      { id: 'amnen', label: 'Ämnen', icon: <BookOpen size={17} /> },
      { id: 'scheman', label: 'Scheman', icon: <Calendar size={17} /> },
      { id: 'kopplingar', label: 'Elever & personal', icon: <GitBranch size={17} /> },
      { id: 'kontaktlistor', label: 'Kontaktlistor', icon: <Users size={17} /> },
    ],
  },
  {
    id: 'adm-uppgifter',
    label: 'Uppgifter & undervisning',
    icon: <ClipboardList size={15} />,
    items: [
      { id: 'uppgifter', label: 'Uppgifter', icon: <ClipboardList size={17} /> },
      { id: 'material', label: 'Undervisningsmaterial', icon: <BookOpen size={17} /> },
      { id: 'elev-dokument', label: 'Elev-dokument', icon: <FileText size={17} /> },
      { id: 'larare-dokument', label: 'Lärare-dokument', icon: <FileText size={17} /> },
    ],
  },
  {
    id: 'adm-kommunikation',
    label: 'Kommunikation',
    icon: <MessageCircle size={15} />,
    items: [
      { id: 'meddelanden', label: 'Meddelanden', icon: <MessageSquare size={17} /> },
      { id: 'forum', label: 'Forum', icon: <MessageCircle size={17} /> },
      { id: 'nyheter', label: 'Nyheter', icon: <GitBranch size={17} /> },
    ],
  },
  {
    id: 'adm-ai',
    label: 'AI',
    icon: <Brain size={15} />,
    items: [
      { id: 'ai-chat', label: 'AI-chat', icon: <Brain size={17} /> },
      { id: 'ai-installningar', label: 'AI-inställningar', icon: <Settings size={17} /> },
    ],
  },
  {
    id: 'adm-system',
    label: 'System',
    icon: <Bell size={15} />,
    items: [
      { id: 'installningar', label: 'Appinställningar', icon: <Settings size={17} /> },
      { id: 'loggar', label: 'Loggar', icon: <ScrollText size={17} /> },
      { id: 'uppdateringar', label: 'Uppdateringar', icon: <History size={17} /> },
    ],
  },
];

function categoriesForPanel(panel: PanelType): NavCategoryDef[] {
  if (panel === 'elev') return ELEV_CATEGORIES;
  if (panel === 'speciallarar') return SPECIALLARAR_CATEGORIES;
  return ADMIN_CATEGORIES;
}

const panelLabels: Record<PanelType, string> = {
  elev: 'Elev',
  speciallarar: 'Speciallärare',
  admin: 'Admin',
};

export const Sidebar: React.FC<SidebarProps> = ({
  panel,
  activePage,
  onNavigate,
  onSwitchPanel,
  onOpenProfile,
}) => {
  const { user } = useAuth();
  const categories = categoriesForPanel(panel);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const isAdminUser = user?.role === 'admin';

  // Öppna alltid den kategori som innehåller den aktiva undersidan.
  useEffect(() => {
    const cat = categories.find((c) => c.items.some((i) => i.id === activePage));
    if (cat) {
      setOpenIds((prev) => (prev.includes(cat.id) ? prev : [...prev, cat.id]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, panel]);

  const toggleCategory = (id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/elda-icon.png" alt="Eldas logotyp" />
        <span>Elda</span>
      </div>

      {/* Panelväljare — endast administratörer får växla mellan paneler */}
      {isAdminUser && (
        <div style={{ display: 'flex', gap: 4, padding: '0 6px 10px' }}>
          {(['elev', 'speciallarar', 'admin'] as PanelType[]).map((p) => (
            <button
              key={p}
              className={`btn btn-sm ${panel === p ? 'btn-primary' : 'btn-outline'}`}
              style={{ flex: 1, padding: '5px 4px', fontSize: 11 }}
              onClick={() => onSwitchPanel(p)}
            >
              {panelLabels[p]}
            </button>
          ))}
        </div>
      )}

      <nav className="side-nav" aria-label="Huvudmeny">
        {categories.map((cat) => {
          const isOpen = openIds.includes(cat.id);
          const containsActive = cat.items.some((i) => i.id === activePage);
          return (
            <div className="nav-group" key={cat.id}>
              <button
                type="button"
                className={`nav-cat ${containsActive ? 'active' : ''}`}
                onClick={() => toggleCategory(cat.id)}
                aria-expanded={isOpen}
              >
                <span className="nav-cat-icon">{cat.icon}</span>
                <span className="nav-cat-label">{cat.label}</span>
                <ChevronRight size={14} className={`nav-cat-chevron ${isOpen ? 'open' : ''}`} />
              </button>
              <div className={`nav-sub ${isOpen ? 'open' : ''}`}>
                <div className="nav-sub-inner">
                  {cat.items.map((item) => (
                    <button
                      key={item.id}
                      className={`nav-item nav-sub-item ${activePage === item.id ? 'active' : ''}`}
                      onClick={() => onNavigate(item.id)}
                      aria-current={activePage === item.id ? 'page' : undefined}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="side-footer">
        <button
          className={`nav-item ${activePage === '__profil' ? 'active' : ''}`}
          onClick={onOpenProfile}
        >
          <User size={17} />
          <span>Profil & inställningar</span>
        </button>
      </div>
    </aside>
  );
};
