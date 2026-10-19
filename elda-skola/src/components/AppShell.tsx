import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  ShieldCheck,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { Avatar } from './ui';
import { longDate, isoWeek, displayName } from '../lib/format';
import {
  cachedSchoolSettings,
  loadSchoolSettings,
  subscribeSchoolSettings,
} from '../lib/school-settings';
import type { Identity, Profile } from '../lib/types';

export type PanelKind = 'elev' | 'larare' | 'admin';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Rubrik som menyalternativet grupperas under. Tom sträng = ingen rubrik. */
  group?: string;
}

/**
 * Elevens meny. Ordningen är också den ordning sidorna får i adressen, så
 * id:na får inte bytas utan att sparade djuplänkar tas om hand.
 */
export const ELEV_NAV: NavItem[] = [
  { id: 'hem', label: 'Hem', icon: <Home size={19} />, group: 'Start' },
  {
    id: 'uppgifter',
    label: 'Uppgifter och inlämningar',
    icon: <ClipboardList size={19} />,
    group: 'Skolarbete',
  },
  { id: 'amnen', label: 'Mina ämnen och material', icon: <BookOpen size={19} />, group: 'Skolarbete' },
  {
    id: 'kalender',
    label: 'Kalender och planering',
    icon: <CalendarDays size={19} />,
    group: 'Skolarbete',
  },
  { id: 'klass', label: 'Min klass', icon: <Users size={19} />, group: 'Min klass' },
  {
    id: 'meddelanden',
    label: 'Meddelanden',
    icon: <MessageSquare size={19} />,
    group: 'Min klass',
  },
  { id: 'framsteg', label: 'Mina framsteg', icon: <ActivityIcon size={19} />, group: 'Min utveckling' },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} />, group: 'Konto' },
];

/**
 * Lärarmeny. Samma id:n som sidkomponenterna i App.tsx använder.
 */
export const LARARE_NAV: NavItem[] = [
  { id: 'oversikt', label: 'Översikt', icon: <LayoutDashboard size={19} />, group: 'Start' },
  {
    id: 'klasser',
    label: 'Mina klasser och elever',
    icon: <GraduationCap size={19} />,
    group: 'Klasser och elever',
  },
  {
    id: 'uppgifter',
    label: 'Uppgifter och aktiviteter',
    icon: <ClipboardList size={19} />,
    group: 'Uppgifter och planering',
  },
  {
    id: 'kalender',
    label: 'Kalender och planering',
    icon: <CalendarDays size={19} />,
    group: 'Uppgifter och planering',
  },
  {
    id: 'inlamningar',
    label: 'Inlämningar och återkoppling',
    icon: <ClipboardCheck size={19} />,
    group: 'Inlämningar och bedömning',
  },
  {
    id: 'material',
    label: 'Undervisningsmaterial',
    icon: <FolderOpen size={19} />,
    group: 'Läromaterial och aktiviteter',
  },
  {
    id: 'aktiviteter',
    label: 'Skapa läraktiviteter',
    icon: <Sparkles size={19} />,
    group: 'Läromaterial och aktiviteter',
  },
  { id: 'anpassningar', label: 'Anpassningar', icon: <UserRound size={19} />, group: 'Elevstöd' },
  {
    id: 'meddelanden',
    label: 'Meddelanden och information',
    icon: <MessageSquare size={19} />,
    group: 'Kommunikation',
  },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} />, group: 'Konto' },
];

/**
 * Administratörens meny. Det här är den enda definitionen – adminpanelen
 * importerar den härifrån i stället för att ha en egen kopia.
 */
export const ADMIN_NAV: NavItem[] = [
  { id: 'oversikt', label: 'Översikt', icon: <LayoutDashboard size={19} />, group: 'Start' },
  {
    id: 'anvandare',
    label: 'Användare och konton',
    icon: <Users size={19} />,
    group: 'Användare och konton',
  },
  {
    id: 'roller',
    label: 'Roller och behörigheter',
    icon: <ShieldCheck size={19} />,
    group: 'Användare och konton',
  },
  {
    id: 'klasser',
    label: 'Klasser och grupper',
    icon: <GraduationCap size={19} />,
    group: 'Skola och undervisning',
  },
  {
    id: 'amnen',
    label: 'Ämnen och undervisning',
    icon: <BookOpen size={19} />,
    group: 'Skola och undervisning',
  },
  {
    id: 'uppgifter',
    label: 'Uppgifter och inlämningar',
    icon: <ClipboardList size={19} />,
    group: 'Innehåll och planering',
  },
  {
    id: 'material',
    label: 'Material och innehåll',
    icon: <FolderOpen size={19} />,
    group: 'Innehåll och planering',
  },
  {
    id: 'kalender',
    label: 'Kalender och planering',
    icon: <CalendarDays size={19} />,
    group: 'Innehåll och planering',
  },
  {
    id: 'meddelanden',
    label: 'Meddelanden',
    icon: <MessageSquare size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'stod',
    label: 'Anpassningar och elevstöd',
    icon: <UserRound size={19} />,
    group: 'Elevstöd',
  },
  { id: 'logg', label: 'Aktivitetslogg', icon: <ActivityIcon size={19} />, group: 'System' },
  {
    id: 'installningar',
    label: 'Systeminställningar',
    icon: <Settings size={19} />,
    group: 'System',
  },
  {
    id: 'profil',
    label: 'Min administratörsprofil',
    icon: <UserRound size={19} />,
    group: 'Konto',
  },
];

/** Menyn för en roll. Används av App.tsx och settings.ts. */
export function navFor(panel: PanelKind): NavItem[] {
  if (panel === 'admin') return ADMIN_NAV;
  if (panel === 'larare') return LARARE_NAV;
  return ELEV_NAV;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

/** Delar upp menyn i grupper utan att ändra ordningen på alternativen. */
export function groupNav(nav: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of nav) {
    const title = (item.group ?? '').trim();
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}

interface Props {
  panel: PanelKind;
  activePage: string;
  onNavigate: (id: string) => void;
  identity: Identity;
  profile: Profile | null;
  onLogout: () => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<Props> = ({
  panel,
  activePage,
  onNavigate,
  identity,
  profile,
  onLogout,
  children,
}) => {
  const nav = navFor(panel);
  const groups = useMemo(() => groupNav(nav), [nav]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('elda-skola-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [school, setSchool] = useState(cachedSchoolSettings);

  // Skolans namn kommer från skolinställningarna och uppdateras direkt när en
  // administratör sparar nya värden – utan omladdning.
  useEffect(() => {
    const unsubscribe = subscribeSchoolSettings(setSchool);
    void loadSchoolSettings();
    return unsubscribe;
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('elda-skola-sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* lagring kan vara avstängd */
    }
  }, [collapsed]);

  // Menyn stängs när man byter sida, så att innehållet syns på mobil.
  useEffect(() => {
    setMobileOpen(false);
  }, [activePage]);

  // Escape stänger menyn, och bakgrunden får inte scrolla bakom den.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const name = displayName(profile) === 'Okänd' ? identity.username : displayName(profile);
  const roleLabel = panel === 'larare' ? 'Lärare' : panel === 'admin' ? 'Administratör' : 'Elev';
  const activeItem = nav.find((item) => item.id === activePage);

  return (
    <div className={`shell ${collapsed ? 'shell-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => onNavigate(nav[0].id)}
            aria-label={`${school.school_name} – startsida`}
            title={school.school_name}
          >
            <img src="elda-icon.png" alt="" />
            <span className="brand-text">
              <strong>{school.school_name}</strong>
              <small>{roleLabel === 'Lärare' ? 'Lärarpanel' : roleLabel === 'Administratör' ? 'Administration' : 'Elevpanel'}</small>
            </span>
          </button>
          <button
            type="button"
            className="icon-btn sidebar-close-mobile"
            onClick={() => setMobileOpen(false)}
            aria-label="Stäng menyn"
          >
            <X size={19} />
          </button>
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Fäll ut sidopanelen' : 'Fäll ihop sidopanelen'}
            aria-expanded={!collapsed}
            aria-controls="skolmeny"
            title={collapsed ? 'Fäll ut sidopanelen' : 'Fäll ihop sidopanelen'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>

        <nav className="side-nav" aria-label="Huvudmeny" id="skolmeny">
          {groups.map((group, index) => (
            <div className="nav-group" key={group.title || `grupp-${index}`}>
              {group.title && <p className="nav-group-label">{group.title}</p>}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${activePage === item.id ? 'nav-item-active' : ''}`}
                  onClick={() => onNavigate(item.id)}
                  aria-current={activePage === item.id ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={item.label}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button type="button" className="user-card" onClick={() => onNavigate('profil')} title={name}>
            <Avatar name={name} size={34} />
            <span className="user-card-text">
              <strong>{name}</strong>
              <small>{roleLabel}</small>
            </span>
          </button>
          <button
            type="button"
            className="nav-item nav-logout"
            onClick={onLogout}
            aria-label="Logga ut"
            title="Logga ut"
          >
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            <span className="nav-label">Logga ut</span>
          </button>
        </div>
      </aside>

      {mobileOpen && <div className="mobile-scrim" onClick={() => setMobileOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Öppna menyn"
            aria-expanded={mobileOpen}
          >
            <Menu size={20} />
          </button>
          {collapsed && (
            <button
              type="button"
              className="icon-btn topbar-expand"
              onClick={() => setCollapsed(false)}
              aria-label="Visa sidopanelen"
              title="Visa sidopanelen"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <div className="topbar-title">
            <span>{activeItem?.label ?? 'Elda Skola'}</span>
          </div>
          <div className="topbar-meta">
            <span className="topbar-date">{longDate()}</span>
            <span className="week-chip">Vecka {isoWeek()}</span>
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
};
