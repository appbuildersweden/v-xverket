import React, { useEffect, useState } from 'react';
import { ChevronRight, User, X } from 'lucide-react';
import { PANEL_LABELS, PanelType, visibleCategories } from '../lib/nav';
import { useAuth } from '../lib/AuthContext';

interface SidebarProps {
  panel: PanelType;
  activePage: string;
  onNavigate: (pageId: string) => void;
  onOpenProfile: () => void;
  /** Öppen på små skärmar (drawer). Större skärmar visar alltid menyn. */
  open?: boolean;
  onClose?: () => void;
  /** Fritext som filtrerar menyvalen. Tom sträng visar hela menyn. */
  filter?: string;
}

/**
 * Sidomenyn. Menyvalen kommer från rollens meny och filtreras mot
 * behörighetsmodellen, så att en elev eller speciallärare aldrig kan få
 * administratörslänkar i menyn.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  panel,
  activePage,
  onNavigate,
  onOpenProfile,
  open = false,
  onClose,
  filter = '',
}) => {
  const { user } = useAuth();
  const categories = visibleCategories(panel, user?.role ?? 'okand');
  const [openIds, setOpenIds] = useState<string[]>([]);

  const query = filter.trim().toLowerCase();
  // Vid filtrering visas bara de grupper och val som matchar, och de är alltid
  // utfällda så att träffen syns direkt.
  const visible = query
    ? categories
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) =>
              item.label.toLowerCase().includes(query) ||
              cat.label.toLowerCase().includes(query),
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : categories;

  // Öppna alltid gruppen som innehåller den aktiva sidan.
  useEffect(() => {
    const cat = categories.find((c) => c.items.some((i) => i.id === activePage));
    if (cat) {
      setOpenIds((prev) => (prev.includes(cat.id) ? prev : [...prev, cat.id]));
    }
  }, [activePage, categories]);

  const toggleCategory = (id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleNavigate = (pageId: string) => {
    onNavigate(pageId);
    onClose?.();
  };

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={() => onClose?.()} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`} aria-label="Huvudmeny">
        <div className="brand">
          <img src="/elda-icon.png" alt="" />
          <div className="brand-text">
            <span className="brand-name">Elda</span>
            <span className="brand-panel">{PANEL_LABELS[panel]}</span>
          </div>
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => onClose?.()}
            aria-label="Stäng menyn"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="side-nav">
          {query && visible.length === 0 && (
            <p className="nav-empty" role="status">
              Ingen meny matchar ”{filter.trim()}”.
            </p>
          )}

          {visible.map((cat) => {
            const isOpen = query ? true : openIds.includes(cat.id);
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
                  <ChevronRight
                    size={14}
                    className={`nav-cat-chevron ${isOpen ? 'open' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {isOpen && (
                  <div className="nav-sub open">
                    <div className="nav-sub-inner">
                      {cat.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`nav-item nav-sub-item ${activePage === item.id ? 'active' : ''}`}
                          onClick={() => handleNavigate(item.id)}
                          aria-current={activePage === item.id ? 'page' : undefined}
                        >
                          {item.icon}
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="side-footer">
          <button
            type="button"
            className={`nav-item ${activePage === '__profil' ? 'active' : ''}`}
            onClick={() => {
              onOpenProfile();
              onClose?.();
            }}
          >
            <User size={17} />
            <span>Profil &amp; inställningar</span>
          </button>
        </div>
      </aside>
    </>
  );
};
