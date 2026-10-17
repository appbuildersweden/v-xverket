import React, { useEffect, useRef, useState } from 'react';
import { LogOut, Moon, Settings, Sun, User } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../theme';
import { PANEL_LABELS, PanelType, ROLE_LABELS } from '../lib/nav';
import { isKnownRole } from '../lib/auth-types';

interface ProfileMenuProps {
  panel: PanelType;
  onOpenProfile: () => void;
}

/**
 * Kontomenyn i toppraden: visar vem som är inloggad, låter användaren växla
 * tema, öppna profilen och logga ut. Stängs med Escape eller klick utanför.
 */
export const ProfileMenu: React.FC<ProfileMenuProps> = ({ panel, onOpenProfile }) => {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  const roleLabel = user && isKnownRole(user.role) ? ROLE_LABELS[user.role] : 'Ingen roll';
  const initials = (user?.username ?? '?').slice(0, 1).toUpperCase();

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
  };

  return (
    <div className="profile-menu" ref={wrapRef}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Konto och profil"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar-circle">{initials}</span>
      </button>

      {open && (
        <div className="menu" role="menu" aria-label="Kontomeny">
          <div className="menu-head">
            <div className="menu-user">{user?.username ?? '—'}</div>
            <div className="menu-role">
              {roleLabel} · {PANEL_LABELS[panel]}
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            <User size={16} /> Profil &amp; inställningar
          </button>

          <button type="button" role="menuitem" className="menu-item" onClick={toggle}>
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            {theme === 'light' ? 'Mörkt läge' : 'Ljust läge'}
          </button>

          <button
            type="button"
            role="menuitem"
            className="menu-item menu-item-danger"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={16} /> {loggingOut ? 'Loggar ut…' : 'Logga ut'}
          </button>

          <div className="menu-foot">
            <Settings size={14} aria-hidden="true" />
            <span>Kontot hanteras av en administratör</span>
          </div>
        </div>
      )}
    </div>
  );
};
