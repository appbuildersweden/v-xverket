import React from 'react';
import { Menu, Moon, Search, Sun, X } from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import { useTheme } from '../theme';
import { PanelType } from '../lib/nav';

interface TopBarProps {
  panel: PanelType;
  onOpenProfile: () => void;
  onToggleSidebar: () => void;
  /** Fritext som filtrerar menyn. Tom sträng visar hela menyn. */
  navQuery: string;
  onNavQuery: (value: string) => void;
}

/**
 * Toppraden: menyknapp (små skärmar), menyfilter, temaväxlare och kontomeny.
 * Fältet filtrerar menyn direkt medan man skriver — det söker i samma menyval
 * som visas, så varje tangenttryckning ger ett synligt resultat.
 */
export const TopBar: React.FC<TopBarProps> = ({
  panel,
  onOpenProfile,
  onToggleSidebar,
  navQuery,
  onNavQuery,
}) => {
  const { theme, toggle } = useTheme();

  return (
    <div className="topbar">
      <button
        type="button"
        className="icon-btn sidebar-toggle"
        onClick={onToggleSidebar}
        aria-label="Öppna menyn"
      >
        <Menu size={19} />
      </button>

      <div className="search-box">
        <input
          type="search"
          placeholder="Filtrera menyn…"
          aria-label="Filtrera menyn"
          value={navQuery}
          onChange={(e) => onNavQuery(e.target.value)}
        />
        {navQuery ? (
          <button
            type="button"
            className="search-btn"
            aria-label="Rensa menyfiltret"
            onClick={() => onNavQuery('')}
          >
            <X size={17} />
          </button>
        ) : (
          <span className="search-btn" aria-hidden="true">
            <Search size={17} />
          </span>
        )}
      </div>

      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn theme-toggle"
          onClick={toggle}
          aria-label={theme === 'light' ? 'Växla till mörkt tema' : 'Växla till ljust tema'}
          title={theme === 'light' ? 'Mörkt tema' : 'Ljust tema'}
        >
          {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
        </button>

        <ProfileMenu panel={panel} onOpenProfile={onOpenProfile} />
      </div>
    </div>
  );
};
