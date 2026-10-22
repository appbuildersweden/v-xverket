import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity as ActivityIcon,
  ShieldCheck,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Coins,
  FolderOpen,
  Ghost,
  GraduationCap,
  Home,
  Megaphone,
  Building2,
  Newspaper,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
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
import { useMessageRealtime, useUnreadTotal } from '../lib/unread';
import { NotificationBell } from './NotificationBell';
import { ThemeMotif, ThemeScenery } from './theme/ThemeScenery';
import { useHalloween } from '../lib/halloween-context';
import { describeTheme } from '../lib/halloween-theme';
import { isPageEnabled, usePlatformFeatures } from '../lib/features';
import type { PlatformFeatures } from '../lib/types';
import { getMyOrganisation } from '../lib/api';
import type { Identity, MyOrganisation, Profile } from '../lib/types';

export type PanelKind = 'elev' | 'larare' | 'speciallarare' | 'admin';

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
  { id: 'information', label: 'Information', icon: <Megaphone size={19} />, group: 'Min klass' },
  {
    id: 'butik',
    label: 'Butiken',
    icon: <ShoppingBag size={19} />,
    group: 'Min utveckling',
  },
  { id: 'framsteg', label: 'Mina framsteg', icon: <ActivityIcon size={19} />, group: 'Min utveckling' },
  { id: 'halloween', label: 'Halloween', icon: <Ghost size={19} />, group: 'Min utveckling' },
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
    label: 'Meddelanden',
    icon: <MessageSquare size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'information',
    label: 'Information',
    icon: <Megaphone size={19} />,
    group: 'Kommunikation',
  },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} />, group: 'Konto' },
];

/**
 * Speciallärarmeny. Specialläraren har en egen panel – den ersätts aldrig av
 * elev- eller lärarpanelen.
 */
export const SPECIAL_NAV: NavItem[] = [
  { id: 'hem', label: 'Startsida', icon: <LayoutDashboard size={19} />, group: 'Start' },
  {
    id: 'elever',
    label: 'Mina elever och elevstöd',
    icon: <UserRound size={19} />,
    group: 'Elever och elevstöd',
  },
  {
    id: 'meddelanden',
    label: 'Meddelanden',
    icon: <MessageSquare size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'information',
    label: 'Information',
    icon: <Megaphone size={19} />,
    group: 'Kommunikation',
  },
  { id: 'profil', label: 'Profil och inställningar', icon: <Settings size={19} />, group: 'Konto' },
];

/**
 * Administratörens meny. Det här är den enda definitionen – adminpanelen
 * importerar den härifrån i stället för att ha en egen kopia.
 *
 * Sju grupper i den ordning en administratör arbetar: översikt, organisation,
 * användare, kommunikation, skolverksamhet, belöningar och system. Varje post
 * har en egen sida i AdminPanel; grupperna är bara rubriker och fällbara.
 */
export const ADMIN_NAV: NavItem[] = [
  { id: 'oversikt', label: 'Startsida', icon: <LayoutDashboard size={19} />, group: 'Översikt' },
  {
    id: 'organisationer',
    label: 'Skolor och medlemskap',
    icon: <Building2 size={19} />,
    group: 'Organisation',
  },
  {
    id: 'klasser',
    label: 'Klasser och medlemmar',
    icon: <GraduationCap size={19} />,
    group: 'Organisation',
  },
  {
    id: 'anvandare',
    label: 'Alla konton',
    icon: <Users size={19} />,
    group: 'Användare och behörigheter',
  },
  {
    id: 'larare',
    label: 'Lärarkonton',
    icon: <UserRound size={19} />,
    group: 'Användare och behörigheter',
  },
  {
    id: 'publiceringar',
    label: 'Nyheter och uppdateringar',
    icon: <Newspaper size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'information',
    label: 'Information till klasser',
    icon: <Megaphone size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'meddelanden',
    label: 'Systemutskick',
    icon: <Send size={19} />,
    group: 'Kommunikation',
  },
  {
    id: 'kalender',
    label: 'Skolans planering',
    icon: <CalendarDays size={19} />,
    group: 'Skolverksamhet',
  },
  {
    id: 'uppgifter',
    label: 'Uppgifter',
    icon: <ClipboardList size={19} />,
    group: 'Skolverksamhet',
  },
  {
    id: 'material',
    label: 'Läromaterial',
    icon: <FolderOpen size={19} />,
    group: 'Skolverksamhet',
  },
  {
    id: 'stod',
    label: 'Elevstöd och anpassningar',
    icon: <ShieldCheck size={19} />,
    group: 'Skolverksamhet',
  },
  {
    id: 'xp',
    label: 'XP och belöningar',
    icon: <Coins size={19} />,
    group: 'Belöningar',
  },
  {
    id: 'butik',
    label: 'Butiken',
    icon: <ShoppingBag size={19} />,
    group: 'Belöningar',
  },
  {
    id: 'funktioner',
    label: 'Funktionshantering',
    icon: <SlidersHorizontal size={19} />,
    group: 'System och säkerhet',
  },
  {
    id: 'logg',
    label: 'Aktivitetslogg',
    icon: <ActivityIcon size={19} />,
    group: 'System och säkerhet',
  },
  {
    id: 'profil',
    label: 'Min administratörsprofil',
    icon: <UserRound size={19} />,
    group: 'Konto',
  },
];

/**
 * Menyn för en roll. Sidor som en funktion har stängt av filtreras bort, så
 * att eleven inte kan navigera till en avstängd butik eller ett avstängt
 * Halloween-område. Utan växlar visas hela menyn (roller och tester).
 */
export function navFor(panel: PanelKind, features?: PlatformFeatures): NavItem[] {
  const nav =
    panel === 'admin'
      ? ADMIN_NAV
      : panel === 'larare'
        ? LARARE_NAV
        : panel === 'speciallarare'
          ? SPECIAL_NAV
          : ELEV_NAV;
  return features ? nav.filter((item) => isPageEnabled(item.id, features)) : nav;
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
  // Funktionsväxlarna styr hela elevmenyn (butik och Halloween). De laddas en
  // gång av App.tsx, så menyn följer samma läge som sidorna. Lärar- och
  // adminvyer påverkas inte.
  const features = usePlatformFeatures();
  const nav = useMemo(() => navFor(panel, features), [panel, features]);
  const groups = useMemo(() => groupNav(nav), [nav]);
  // Olästa meddelanden visas i menyn för alla roller och uppdateras både vid
  // läsning och via realtime, från samma serverräknade värde.
  // Adminmenyn har fällbara grupper. Elev-, lärar- och speciallärarmenyn
  // behåller sin fasta struktur, så att bara administratörsvyn ändras här.
  const collapsibleGroups = panel === 'admin';
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('elda-skola-nav-groups');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')
        ? parsed
        : [];
    } catch {
      return [];
    }
  });
  const toggleGroup = (title: string) =>
    setCollapsedGroups((current) =>
      current.includes(title) ? current.filter((value) => value !== title) : [...current, title],
    );
  const unread = useUnreadTotal();
  useMessageRealtime();
  // Elevens aktiva tema. Tomt för lärare och admin, som aldrig har en provider.
  const { themeKey } = useHalloween();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('elda-skola-sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [school, setSchool] = useState(cachedSchoolSettings);
  // Den egna skolorganisationen. Den visas under Elda Skola i sidopanelen så
  // att personal och elever ser vilken skola de arbetar i.
  const [organisation, setOrganisation] = useState<MyOrganisation | null>(null);

  useEffect(() => {
    let alive = true;
    void getMyOrganisation()
      .then((row) => {
        if (alive) setOrganisation(row);
      })
      .catch(() => {
        // Sidopanelen fungerar utan skolnamnet – visa då bara Elda Skola.
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // Ihopfällda grupper sparas lokalt, så att menyn ser likadan ut nästa gång.
  useEffect(() => {
    if (!collapsibleGroups) return;
    try {
      localStorage.setItem('elda-skola-nav-groups', JSON.stringify(collapsedGroups));
    } catch {
      /* lagring kan vara avstängd */
    }
  }, [collapsedGroups, collapsibleGroups]);

  // Den grupp som innehåller den aktiva sidan fälls alltid ut.
  useEffect(() => {
    if (!collapsibleGroups) return;
    const group = nav.find((item) => item.id === activePage)?.group;
    if (!group) return;
    setCollapsedGroups((current) =>
      current.includes(group) ? current.filter((value) => value !== group) : current,
    );
  }, [activePage, nav, collapsibleGroups]);

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
  const roleLabel =
    panel === 'larare'
      ? 'Lärare'
      : panel === 'admin'
        ? 'Systemadministratör'
        : panel === 'speciallarare'
          ? 'Speciallärare'
          : 'Elev';
  const panelLabel =
    panel === 'larare'
      ? 'Lärarpanel'
      : panel === 'admin'
        ? 'Systemadministration'
        : panel === 'speciallarare'
          ? 'Speciallärarpanel'
          : 'Elevpanel';
  const activeItem = nav.find((item) => item.id === activePage);

  return (
    <div className={`shell ${collapsed ? 'shell-collapsed' : ''}`}>
      {/* Temats egen scen. Tom för alla som inte har ett tema aktivt. */}
      <ThemeScenery />
      <aside className={`sidebar ${mobileOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="brand"
            onClick={() => onNavigate(nav[0].id)}
            aria-label={`${school.school_name} – ${panelLabel} – startsida`}
            title={school.school_name}
          >
            <img src="elda-icon.png" alt="" />
            <span className="brand-text">
              <strong>Elda Skola</strong>
              {organisation && (
                <small className="brand-school" title={organisation.name}>
                  {organisation.name}
                  {organisation.municipality ? ` · ${organisation.municipality}` : ''}
                </small>
              )}
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
          {groups.map((group, index) => {
            // I ikonläget finns ingen rubrik att fälla, så alla poster visas.
            const fald = collapsibleGroups && !collapsed && collapsedGroups.includes(group.title);
            const itemsId = `nav-grupp-${index}`;
            return (
              <div
                className={`nav-group ${fald ? 'nav-group-folded' : ''}`}
                key={group.title || `grupp-${index}`}
              >
                {group.title &&
                  (collapsibleGroups ? (
                    <button
                      type="button"
                      className="nav-group-toggle"
                      aria-expanded={!fald}
                      aria-controls={itemsId}
                      onClick={() => toggleGroup(group.title)}
                      title={`${fald ? 'Visa' : 'Dölj'} ${group.title.toLowerCase()}`}
                    >
                      <span className="nav-group-label">{group.title}</span>
                      <ChevronDown size={13} className="nav-group-chevron" aria-hidden />
                    </button>
                  ) : (
                    <p className="nav-group-label">{group.title}</p>
                  ))}
                <div className="nav-group-items" id={itemsId} hidden={fald}>
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
                      {item.id === 'meddelanden' && unread > 0 && (
                        <span
                          className="nav-badge"
                          aria-label={`${unread} olästa meddelanden`}
                          title={`${unread} olästa`}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {themeKey && (
            <div className="sidebar-theme" title={`Aktivt tema: ${describeTheme(themeKey)}`}>
              <ThemeMotif themeKey={themeKey} size={20} />
              <span className="sidebar-theme-label">{describeTheme(themeKey)}</span>
            </div>
          )}
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
            {nav.some((item) => item.id === 'butik') && (
              <button
                type="button"
                className="icon-btn shop-nav-btn"
                onClick={() => onNavigate('butik')}
                aria-label="Öppna butiken"
                title="Butiken"
              >
                <ShoppingBag size={18} />
              </button>
            )}
            <NotificationBell pages={nav.map((item) => item.id)} onNavigate={onNavigate} />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
};
