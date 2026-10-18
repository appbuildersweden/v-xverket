import React from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Brain,
  Calendar,
  CheckSquare,
  ClipboardList,
  Circle,
  FileText,
  GitBranch,
  Globe,
  GraduationCap,
  History,
  Home,
  Layers,
  MessageCircle,
  MessageSquare,
  Package,
  ScrollText,
  Settings,
  Shield,
  ShieldQuestion,
  Sparkles,
  Store,
  UserCog,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { Panel, Role } from './auth-types';

export type PanelType = Panel;

export interface NavItemDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Kort beskrivning som startsidor och tomlägen kan använda. */
  description?: string;
}

/** En grupp i menyn (rubrik + undersidor). */
export interface NavCategoryDef {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: NavItemDef[];
}

// ----------------------------------------------------------------
// Elevpanelen
// ----------------------------------------------------------------

const ELEV_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'elev-oversikt',
    label: 'Översikt',
    icon: <Home size={15} />,
    items: [
      {
        id: 'start',
        label: 'Översikt',
        icon: <Home size={17} />,
        description: 'Dagens planering, uppgifter och det senaste för dig.',
      },
    ],
  },
  {
    id: 'elev-skolarbete',
    label: 'Skolarbete',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'planering', label: 'Min planering', icon: <Calendar size={17} /> },
      { id: 'amnen', label: 'Mina ämnen', icon: <BookOpen size={17} /> },
      { id: 'uppgifter', label: 'Uppgifter', icon: <CheckSquare size={17} /> },
      { id: 'dokument', label: 'Mina dokument', icon: <FileText size={17} /> },
    ],
  },
  {
    id: 'elev-plugghjalp',
    label: 'Plugg-hjälp',
    icon: <Brain size={15} />,
    items: [
      { id: 'ai-hjalp', label: 'AI-studiehjälp', icon: <Sparkles size={17} /> },
      { id: 'flashcards', label: 'Flashcards och repetition', icon: <Layers size={17} /> },
      { id: 'provtraning', label: 'Provträning', icon: <ClipboardList size={17} /> },
    ],
  },
  {
    id: 'elev-klass',
    label: 'Min klass',
    icon: <Users size={15} />,
    items: [
      { id: 'klass', label: 'Min klass', icon: <Users size={17} /> },
      { id: 'klasschatt', label: 'Klasschatt', icon: <MessageCircle size={17} /> },
    ],
  },
  {
    id: 'elev-meddelanden',
    label: 'Meddelanden',
    icon: <MessageSquare size={15} />,
    items: [
      {
        id: 'meddelanden',
        label: 'Meddelanden',
        icon: <MessageSquare size={17} />,
        description: 'Privata samtal med din lärare.',
      },
    ],
  },
  {
    id: 'elev-framsteg',
    label: 'Framsteg',
    icon: <Award size={15} />,
    items: [
      { id: 'framsteg', label: 'Mina framsteg', icon: <Zap size={17} /> },
      { id: 'belonningar', label: 'Belöningar och nivåer', icon: <Award size={17} /> },
    ],
  },
  {
    id: 'elev-shop',
    label: 'Shop',
    icon: <Store size={15} />,
    items: [
      {
        id: 'shop',
        label: 'Shop',
        icon: <Store size={17} />,
        description: 'Teman, figurer, avatarer och dekorationer för dina XP.',
      },
      {
        id: 'samling',
        label: 'Min samling',
        icon: <Package size={17} />,
        description: 'Allt du äger — och det du har utrustat.',
      },
    ],
  },
];

// ----------------------------------------------------------------
// Privatelevpanelen
// ----------------------------------------------------------------

/**
 * Privatelevens panel: samma studieverktyg som skoleleven, men helt utan
 * klass, klasskamrater, klasschatt och klassuppgifter. Eleven studerar
 * självständigt och äger sina egna uppgifter och sin egen planering.
 */
const PRIVAT_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'privat-oversikt',
    label: 'Översikt',
    icon: <Home size={15} />,
    items: [
      {
        id: 'start',
        label: 'Översikt',
        icon: <Home size={17} />,
        description: 'Dagens planering, dina uppgifter och dina framsteg.',
      },
    ],
  },
  {
    id: 'privat-studier',
    label: 'Mina studier',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'planering', label: 'Min planering', icon: <Calendar size={17} /> },
      { id: 'amnen', label: 'Mina ämnen', icon: <BookOpen size={17} /> },
      { id: 'uppgifter', label: 'Mina uppgifter', icon: <CheckSquare size={17} /> },
      { id: 'dokument', label: 'Mina dokument', icon: <FileText size={17} /> },
    ],
  },
  {
    id: 'privat-plugghjalp',
    label: 'Studiehjälp',
    icon: <Brain size={15} />,
    items: [
      { id: 'ai-hjalp', label: 'AI-studiehjälp', icon: <Sparkles size={17} /> },
      { id: 'flashcards', label: 'Flashcards och repetition', icon: <Layers size={17} /> },
      { id: 'provtraning', label: 'Provträning', icon: <ClipboardList size={17} /> },
    ],
  },
  {
    id: 'privat-framsteg',
    label: 'Framsteg',
    icon: <Award size={15} />,
    items: [
      { id: 'framsteg', label: 'Mina framsteg', icon: <Zap size={17} /> },
      { id: 'belonningar', label: 'Belöningar och nivåer', icon: <Award size={17} /> },
    ],
  },
  {
    id: 'privat-shop',
    label: 'Shop',
    icon: <Store size={15} />,
    items: [
      {
        id: 'shop',
        label: 'Shop',
        icon: <Store size={17} />,
        description: 'Teman, figurer, avatarer och dekorationer för dina XP.',
      },
      {
        id: 'samling',
        label: 'Min samling',
        icon: <Package size={17} />,
        description: 'Allt du äger — och det du har utrustat.',
      },
    ],
  },
];

// ----------------------------------------------------------------
// Lärarpanelen
// ----------------------------------------------------------------

// Lärarpanelen är skolans lärarroll: egna klasser med klasskod, klassansökningar,
// egna elever, uppgifter, material, uppföljning och planering. Rollen når aldrig
// en annan lärares klass eller administratörens funktioner — det avgörs av
// servern (RLS och funktionernas egna kontroller).
const LARARE_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'lar-hem',
    label: 'Hem',
    icon: <Home size={15} />,
    items: [
      {
        id: 'hem',
        label: 'Hem',
        icon: <Home size={17} />,
        description: 'Dina klasser, klassansökningar och dagens uppgifter.',
      },
    ],
  },
  {
    id: 'lar-klasser',
    label: 'Klasser',
    icon: <Layers size={15} />,
    items: [
      {
        id: 'klasser',
        label: 'Mina klasser',
        icon: <Layers size={17} />,
        description: 'Klasskod, klassansökningar och eleverna i klassen.',
      },
      {
        id: 'elever',
        label: 'Mina elever',
        icon: <Users size={17} />,
        description: 'Eleverna i dina egna klasser.',
      },
    ],
  },
  {
    id: 'lar-undervisning',
    label: 'Undervisning',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'uppgifter', label: 'Uppgifter', icon: <CheckSquare size={17} /> },
      { id: 'material', label: 'Undervisningsmaterial', icon: <BookOpen size={17} /> },
      { id: 'uppfoljning', label: 'Uppföljning och återkoppling', icon: <ClipboardList size={17} /> },
      { id: 'planering', label: 'Min planering och att göra', icon: <Calendar size={17} /> },
    ],
  },
  {
    id: 'lar-kontakt',
    label: 'Kommunikation',
    icon: <MessageSquare size={15} />,
    items: [
      {
        id: 'kontakt-admin',
        label: 'Kontakta administratören',
        icon: <MessageSquare size={17} />,
        description: 'Ställ frågor till skolans administratör.',
      },
      { id: 'ai-assistent', label: 'AI-assistent', icon: <Sparkles size={17} /> },
    ],
  },
];

// ----------------------------------------------------------------
// Speciallärarpanelen
// ----------------------------------------------------------------

const SPECIALLARAR_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'spec-hem',
    label: 'Hem',
    icon: <Home size={15} />,
    items: [
      {
        id: 'hem',
        label: 'Hem',
        icon: <Home size={17} />,
        description: 'Översikt över dagen, dina elever och dina uppgifter.',
      },
    ],
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
    id: 'spec-kommunikation',
    label: 'Kommunikation',
    icon: <MessageCircle size={15} />,
    items: [
      { id: 'global-chatt', label: 'Global chatt', icon: <Globe size={17} /> },
      { id: 'private-chattar', label: 'Privata chattar', icon: <Circle size={17} /> },
    ],
  },
  {
    id: 'spec-undervisning',
    label: 'Undervisning',
    icon: <BookOpen size={15} />,
    items: [
      { id: 'material', label: 'Undervisningsmaterial', icon: <BookOpen size={17} /> },
      // Sid-id:t hålls utan svenska tecken (uppfoljning) så att adressfältets
      // rutt (#/speciallarar/uppfoljning) alltid kan läsas tillbaka.
      { id: 'uppfoljning', label: 'Uppgifter och uppföljning', icon: <ClipboardList size={17} /> },
      { id: 'planering', label: 'Min planering och att göra', icon: <Calendar size={17} /> },
    ],
  },
  {
    id: 'spec-utveckling',
    label: 'Utveckling',
    icon: <Award size={15} />,
    items: [{ id: 'belonningar', label: 'Belöningar och upplåsningar', icon: <Award size={17} /> }],
  },
  {
    id: 'spec-ai',
    label: 'AI-stöd',
    icon: <Sparkles size={15} />,
    items: [{ id: 'ai-assistent', label: 'AI-assistent', icon: <Sparkles size={17} /> }],
  },
];

// ----------------------------------------------------------------
// Adminpanelen
// ----------------------------------------------------------------

const ADMIN_CATEGORIES: NavCategoryDef[] = [
  {
    id: 'adm-oversikt',
    label: 'Översikt',
    icon: <Home size={15} />,
    items: [
      {
        id: 'start',
        label: 'Startsida',
        icon: <Home size={17} />,
        description: 'Administrativ översikt och genvägar till det viktigaste.',
      },
    ],
  },
  {
    id: 'adm-anvandare',
    label: 'Användare',
    icon: <Users size={15} />,
    items: [
      { id: 'anv-elever', label: 'Elever', icon: <Users size={17} /> },
      { id: 'anv-personal', label: 'Personal', icon: <UserCog size={17} /> },
      { id: 'anv-speciallarare', label: 'Speciallärare', icon: <GraduationCap size={17} /> },
      { id: 'anvandare', label: 'Konton', icon: <UserPlus size={17} /> },
      { id: 'roller', label: 'Roller och behörigheter', icon: <Shield size={17} /> },
      {
        id: 'ansokningar',
        label: 'Registreringsansökningar',
        icon: <ShieldQuestion size={17} />,
        description: 'Konton som skapats via registreringsboten och väntar på granskning.',
      },
      { id: 'create-user', label: 'Skapa konto', icon: <UserPlus size={17} /> },
    ],
  },
  {
    id: 'adm-skolan',
    label: 'Skolan',
    icon: <GraduationCap size={15} />,
    items: [
      { id: 'klasser', label: 'Klasser och elevgrupper', icon: <Layers size={17} /> },
      {
        id: 'amnen',
        label: 'Scheman',
        icon: <Calendar size={17} />,
        description: 'Återkommande aktiviteter per veckodag för en klass eller en person.',
      },
    ],
  },
  {
    id: 'adm-undervisning',
    label: 'Undervisning',
    icon: <ClipboardList size={15} />,
    items: [
      { id: 'uppgifter', label: 'Uppgifter och undervisningsmaterial', icon: <ClipboardList size={17} /> },
      { id: 'dokument', label: 'Elevdokument och lärardokument', icon: <FileText size={17} /> },
    ],
  },
  {
    id: 'adm-shop',
    label: 'Shop',
    icon: <Store size={15} />,
    items: [
      {
        id: 'shop',
        label: 'Shop och säsonger',
        icon: <Store size={17} />,
        description: 'Produkter, XP-priser, sällsynthet, nivåkrav och säsonger.',
      },
    ],
  },
  {
    id: 'adm-kommunikation',
    label: 'Kommunikation',
    icon: <MessageCircle size={15} />,
    items: [
      { id: 'meddelanden', label: 'Meddelanden och nyheter', icon: <MessageSquare size={17} /> },
    ],
  },
  {
    id: 'adm-system',
    label: 'AI och system',
    icon: <Settings size={15} />,
    items: [
      {
        id: 'ai-assistent',
        label: 'AI-assistent',
        icon: <Sparkles size={17} />,
        description: 'Administrativt stöd, texter och Office-dokument.',
      },{
        id: 'ai-installningar',
        label: 'AI-inställningar',
        icon: <Brain size={17} /> },

      { id: 'installningar', label: 'Profil och inställningar', icon: <Settings size={17} /> },
      { id: 'loggar', label: 'Loggar', icon: <ScrollText size={17} /> },
      {
        id: 'granskningslogg',
        label: 'Granskningslogg',
        icon: <ScrollText size={17} />,
        description: 'Beslut om registreringar, konton, roller och klasser.',
      },
      { id: 'uppdateringar', label: 'Uppdateringar', icon: <History size={17} /> },
      { id: 'kopplingar', label: 'Kopplingar', icon: <GitBranch size={17} /> },
      { id: 'nyheter', label: 'Nyheter', icon: <Bell size={17} /> },
    ],
  },
];

/** Menyn per panel. Samma struktur som appens rollmodell. */
export const NAV_CATEGORIES: Readonly<Record<Panel, NavCategoryDef[]>> = {
  elev: ELEV_CATEGORIES,
  privat: PRIVAT_CATEGORIES,
  larare: LARARE_CATEGORIES,
  speciallarar: SPECIALLARAR_CATEGORIES,
  admin: ADMIN_CATEGORIES,
};

/** Första sidan i varje panel (rollens startsida). */
export const FIRST_PAGE: Readonly<Record<Panel, string>> = {
  elev: 'start',
  privat: 'start',
  larare: 'hem',
  speciallarar: 'hem',
  admin: 'start',
};

export const PANEL_LABELS: Readonly<Record<Panel, string>> = {
  elev: 'Elev',
  privat: 'Privatelev',
  larare: 'Lärare',
  speciallarar: 'Speciallärare',
  admin: 'Admin',
};

/** Panelens namn på rollspråk, för information till användaren. */
export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  admin: 'Administratör',
  'lärare': 'Lärare',
  'speciallärare': 'Speciallärare',
  elev: 'Elev',
};

// ----------------------------------------------------------------
// Hjälpare
// ----------------------------------------------------------------

export function isPanel(value: unknown): value is Panel {
  return (
    value === 'elev' ||
    value === 'privat' ||
    value === 'larare' ||
    value === 'speciallarar' ||
    value === 'admin'
  );
}

/** Alla sid-id:n som hör till en panel (från menystrukturen). */
export function panelPages(panel: Panel): string[] {
  const categories = NAV_CATEGORIES[panel];
  if (!categories) return [];
  return categories.flatMap((c) => c.items.map((i) => i.id));
}

/** Sant om sidan finns i panelens meny. Okänd panel ger alltid false. */
export function isPageInPanel(panel: Panel, page: string): boolean {
  if (!isPanel(panel)) return false;
  return panelPages(panel).includes(page);
}

/** Menytexten för en sida i en panel (används för rubriker). */
export function labelForPage(panel: Panel, page: string): string | null {
  const categories = NAV_CATEGORIES[panel];
  if (!categories) return null;
  for (const cat of categories) {
    const item = cat.items.find((i) => i.id === page);
    if (item) return item.label;
  }
  return null;
}

/** Beskrivningen för en sida (används i tomlägen och på startsidor). */
export function descriptionForPage(panel: Panel, page: string): string | null {
  const categories = NAV_CATEGORIES[panel];
  if (!categories) return null;
  for (const cat of categories) {
    const item = cat.items.find((i) => i.id === page);
    if (item?.description) return item.description;
  }
  return null;
}

/** Kategorin (gruppen) som en sida tillhör. */
export function categoryForPage(panel: Panel, page: string): NavCategoryDef | null {
  const categories = NAV_CATEGORIES[panel];
  if (!categories) return null;
  return categories.find((c) => c.items.some((i) => i.id === page)) ?? null;
}

/**
 * Menyvalen en roll får se. Panelerna är redan rollstyrda av ruttvakten, men
 * filtreringen sker på samma ställe som behörighetsmodellen så att adminlänkar
 * aldrig kan råka visas för en elev.
 */
export function visibleCategories(panel: Panel, role: Role | 'okand'): NavCategoryDef[] {
  if (role === 'admin') return NAV_CATEGORIES[panel] ?? [];
  if (panel === 'admin') return [];
  if (panel === 'larare' && role === 'lärare') return NAV_CATEGORIES.larare;
  if (panel === 'speciallarar' && role === 'speciallärare') {
    return NAV_CATEGORIES.speciallarar;
  }
  if (panel === 'elev' && role === 'elev') return NAV_CATEGORIES.elev;
  if (panel === 'privat' && role === 'elev') return NAV_CATEGORIES.privat;
  return [];
}
