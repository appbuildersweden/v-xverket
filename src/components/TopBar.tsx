import React from 'react';
import { Search, Moon, Sun, Bell, Calendar, Mail } from 'lucide-react';
import { useTheme } from '../theme';

interface TopBarProps {
  role: 'elev' | 'speciallarar' | 'admin';
  onOpenProfile: () => void;
}

const initials: Record<TopBarProps['role'], string> = {
  elev: 'E',
  speciallarar: 'S',
  admin: 'A',
};

export const TopBar: React.FC<TopBarProps> = ({ role, onOpenProfile }) => {
  const { theme, toggle } = useTheme();

  return (
    <div className="topbar">
      <div className="search-box">
        <input type="text" placeholder="Sök här..." aria-label="Sök" />
        <button className="search-btn" aria-label="Sök">
          <Search size={17} />
        </button>
      </div>
      <div className="topbar-actions">
        <button
          className="icon-btn"
          onClick={toggle}
          aria-label={theme === 'light' ? 'Växla till mörkt tema' : 'Växla till ljust tema'}
          title={theme === 'light' ? 'Mörkt tema' : 'Ljust tema'}
        >
          {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
        </button>
        <button className="icon-btn" aria-label="Aviseringar" title="Aviseringar">
          <Bell size={19} />
        </button>
        <button className="icon-btn" aria-label="Kalender" title="Kalender">
          <Calendar size={19} />
        </button>
        <button className="icon-btn" aria-label="Meddelanden" title="Meddelanden">
          <Mail size={19} />
        </button>
        <button className="avatar-btn" onClick={onOpenProfile} aria-label="Profil">
          <span className="avatar-circle">{initials[role]}</span>
        </button>
      </div>
    </div>
  );
};
