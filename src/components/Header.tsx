import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface HeaderProps {
  title: string;
  onBack?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, onBack }) => {
  return (
    <header className="header">
      {onBack && (
        <button className="btn btn-ghost btn-icon" onClick={onBack} style={{ display: 'flex' }}>
          <ArrowLeft size={18} />
        </button>
      )}
      <h1>{title}</h1>
      <div className="header-spacer" />
    </header>
  );
};
