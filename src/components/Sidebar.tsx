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
  ChevronRight,
  UserPlus,
  Layers,
  Settings,
  History,
  Contact,
} from 'lucide-react';
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
  onOpenProfile: () => void;
  /**
   * Lärarnas funktionsval från servern. Styr vilka menyval som visas; undefined
   * betyder "visa hela panelen" (t.ex. för en administratör).
   */
  features?: string[];
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
    id: 'adm-oversikt',
    label: 'Översikt',
    icon: <Home size={15} />,
    items: [{ id: 'start', label: 'Översikt', icon: <Home size={17} /> }],
  },
  {
    id: 'adm-konton',
    label: 'Användare och konton',
    icon: <Users size={15} />,
    items: [
      { id: 'anvandare', label: 'Användare och konton', icon: <Users size={17} /> },
    ],
  },
  {
    id: 'adm-skapa-konto',
    label: 'Skapa konto',
    icon: <UserPlus size={15} />,
    items: [{ id: 'create-user', label: 'Skapa konto', icon: <UserPlus size={17} /> }],
  },
  {
    id: 'adm-nyheter',
    label: 'Nyheter och uppdateringar',
    icon: <History size={15} />,
    items: [
      {
        id: 'nyheter',
        label: 'Nyheter och uppdateringar',
        icon: <History size={17} />,
      },
      {
        id: 'uppdateringar',
        label: 'Uppdateringar',
        icon: <History size={17} />,
      },
    ],
  },
  {
    id: 'adm-meddelanden',
    label: 'Meddelanden',
    icon: <MessageSquare size={15} />,
    items: [
      { id: 'meddelanden', label: 'Meddelanden', icon: <MessageSquare size={17} /> },
    ],
  },
  {
    id: 'adm-lararkontakter',
    label: 'Lärarkontakter',
    icon: <Contact size={15} />,
    items: [
      { id: 'lararkontakter', label: 'Lärarkontakter', icon: <Contact size={17} /> },
    ],
  },
  {
    id: 'adm-installningar',
    label: 'Inställningar',
    icon: <Settings size={15} />,
    items: [
      { id: 'installningar', label: 'Inställningar', icon: <Settings size={17} /> },
    ],
  },
];

// Funktionsval → menyval. Strängarna är desamma som servern och databasen
// använder (supabase/functions/_shared/features.ts). Äldre etiketter finns kvar
// så att ett konto som sparades före namnbytet inte tappar sina val.
const FEATURE_ITEMS: Record<string, string[]> = {
  'Klass och elevöversikt': ['elever', 'meddelande-elever'],
  'Klass och klasschatt': ['elever', 'meddelande-elever'],
  'Uppgifter och uppföljning': ['uppföljning'],
  'Uppgifter och återkoppling': ['uppföljning'],
  'Undervisningsmaterial': ['material'],
  'Planering och att göra': ['planering'],
  'Provträning och flashcards': ['uppföljning'],
  'Belöningar och nivåer': ['belonningar'],
  'AI-stöd i undervisningen': ['ai-assistent'],
};

/** Vyer som alltid finns i personalpanelen, oavsett funktionsval. */
const ALWAYS_VISIBLE = new Set(['hem', 'global-chatt', 'private-chattar']);

function categoriesForPanel(panel: PanelType, features?: string[]): NavCategoryDef[] {
  if (panel === 'elev') return ELEV_CATEGORIES;
  if (panel === 'admin') return ADMIN_CATEGORIES;

  if (!features) return SPECIALLARAR_CATEGORIES;

  const allowed = new Set(ALWAYS_VISIBLE);
  for (const feature of features) {
    for (const item of FEATURE_ITEMS[feature] ?? []) allowed.add(item);
  }

  return SPECIALLARAR_CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter((item) => allowed.has(item.id)),
  })).filter((category) => category.items.length > 0);
}

export const Sidebar: React.FC<SidebarProps> = ({
  panel,
  activePage,
  onNavigate,
  onOpenProfile,
  features,
}) => {
  const categories = categoriesForPanel(panel, features);
  const [openIds, setOpenIds] = useState<string[]>([]);

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

      <nav className="side-nav" aria-label="Huvudmeny">
        {panel === 'admin' &&
          categories.flatMap((cat) => cat.items).map((item) => (
            <button
              type="button"
              key={item.id}
              className={`nav-item admin-nav-item${
                activePage === item.id ? ' active' : ''
              }`}
              onClick={() => onNavigate(item.id)}
              aria-current={activePage === item.id ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}

        {panel !== 'admin' && categories.map((cat) => {
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
