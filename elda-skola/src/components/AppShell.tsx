import React, { useEffect, useState } from 'react';
import {
  Activity as ActivityIcon,
  ShieldCheck,
  BookOpen,
  CalendarDays,
  ChevronRight,
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
import type { Identity, Profile } from '../lib/types';

export type PanelKind = 'elev' | 'larare' | 'admin';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export const ELEV_NAV: NavItem[] = [
  { id: 'hem', label: 'Hem', icon: <Home size={19} /> },
  { id: 'uppgifter', label: 'Uppgifter', icon: <ClipboardList size={19} /> },
  { id: 'amnen', label: 'Mina ämnen och material', icon: <BookOpen size={19} /> },
  { id: 'kalender', label: 'Kalender och planering', icon: <CalendarDays size={19} /> },
  { id: 'klass', label: 'Min klass', icon: <Users size={19} /> },
  { id: 'meddelanden', label: 'Meddelanden', icon: <MessageSquare size={19} /> },
  { id: 'framsteg', label: 'Mina framsteg', icon: <ActivityIcon size={19} /> },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} /> },
];

export const ADMIN_NAV: NavItem[] = [
  { id: 'oversikt', label: 'Översikt', icon: <LayoutDashboard size={19} /> },
  { id: 'anvandare', label: 'Användare och konton', icon: <Users size={19} /> },
  { id: 'roller', label: 'Roller och behörigheter', icon: <ShieldCheck size={19} /> },
  { id: 'klasser', label: 'Klasser och grupper', icon: <GraduationCap size={19} /> },
  { id: 'amnen', label: 'Ämnen och undervisning', icon: <BookOpen size={19} /> },
  { id: 'material', label: 'Material och innehåll', icon: <FolderOpen size={19} /> },
  { id: 'uppgifter', label: 'Uppgifter och inlämningar', icon: <ClipboardList size={19} /> },
  { id: 'kalender', label: 'Kalender och planering', icon: <CalendarDays size={19} /> },
  { id: 'stod', label: 'Anpassningar och elevstöd', icon: <UserRound size={19} /> },
  { id: 'logg', label: 'Aktivitetslogg', icon: <ActivityIcon size={19} /> },
  { id: 'meddelanden', label: 'Meddelanden', icon: <MessageSquare size={19} /> },
  { id: 'installningar', label: 'Systeminställningar', icon: <Settings size={19} /> },
  { id: 'profil', label: 'Min administratörsprofil', icon: <Settings size={19} /> },
];

export const LARARE_NAV: NavItem[] = [
  { id: 'oversikt', label: 'Översikt', icon: <LayoutDashboard size={19} /> },
  { id: 'uppgifter', label: 'Uppgifter och aktiviteter', icon: <ClipboardList size={19} /> },
  { id: 'aktiviteter', label: 'Skapa läraktiviteter', icon: <Sparkles size={19} /> },
  { id: 'material', label: 'Undervisningsmaterial', icon: <FolderOpen size={19} /> },
  { id: 'klasser', label: 'Mina klasser och elever', icon: <GraduationCap size={19} /> },
  { id: 'kalender', label: 'Kalender och planering', icon: <CalendarDays size={19} /> },
  { id: 'meddelanden', label: 'Meddelanden och information', icon: <MessageSquare size={19} /> },
  { id: 'inlamningar', label: 'Inlämningar och återkoppling', icon: <ClipboardCheck size={19} /> },
  { id: 'anpassningar', label: 'Anpassningar', icon: <UserRound size={19} /> },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} /> },
];

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
  const nav = panel === 'admin' ? ADMIN_NAV : panel === 'larare' ? LARARE_NAV : ELEV_NAV;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('elda-skola-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('elda-skola-sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* lagring kan vara avstängd */
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [activePage]);

  const name = displayName(profile) === 'Okänd' ? identity.username : displayName(profile);

  return (
    <div className={`shell ${collapsed ? 'shell-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => onNavigate(nav[0].id)}
            aria-label="Elda Skola – startsida"
          >
            <img src="/elda-icon.png" alt="" />
            <span className="brand-text">
              <strong>Elda Skola</strong>
              <small>{panel === 'larare' ? 'Lärarpanel' : panel === 'admin' ? 'Administration' : 'Elevpanel'}</small>
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
        </div>

        <nav className="side-nav" aria-label="Huvudmeny">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${activePage === item.id ? 'nav-item-active' : ''}`}
              onClick={() => onNavigate(item.id)}
              aria-current={activePage === item.id ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button type="button" className="user-card" onClick={() => onNavigate('profil')}>
            <Avatar name={name} size={34} />
            <span className="user-card-text">
              <strong>{name}</strong>
              <small>{panel === 'larare' ? 'Lärare' : panel === 'admin' ? 'Administratör' : 'Elev'}</small>
            </span>
          </button>
          <button
            type="button"
            className="nav-item nav-logout"
            onClick={onLogout}
            title="Logga ut"
          >
            <span className="nav-icon">
              <LogOut size={18} />
            </span>
            <span className="nav-label">Logga ut</span>
          </button>
          <button
            type="button"
            className="collapse-btn"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Fäll ut sidopanelen' : 'Fäll ihop sidopanelen'}
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span>{collapsed ? '' : 'Fäll ihop'}</span>
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
          >
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <span>Elda Skola</span>
            {collapsed && (
              <button
                type="button"
                className="topbar-expand"
                onClick={() => setCollapsed(false)}
                aria-label="Visa sidopanelen"
              >
                <ChevronRight size={15} />
              </button>
            )}
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
