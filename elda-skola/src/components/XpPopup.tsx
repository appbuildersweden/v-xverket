import React, { useEffect } from 'react';
import { Sparkles } from 'lucide-react';

interface Props {
  xp: number;
  taskTitle: string | null;
  onClose: () => void;
}

/**
 * Visas först när servern har registrerat XP. Den påstår aldrig en belöning
 * som inte finns i databasen, eftersom beloppet kommer från celebrate-anropet.
 */
export const XpPopup: React.FC<Props> = ({ xp, taskTitle, onClose }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="xp-popup-backdrop">
      <div className="xp-popup" role="dialog" aria-modal="true" aria-labelledby="xp-popup-title">
        <span className="xp-popup-icon" aria-hidden>
          <Sparkles size={22} />
        </span>
        <p className="xp-popup-amount">+{xp} XP</p>
        <h2 id="xp-popup-title" className="xp-popup-title">Snyggt jobbat!</h2>
        <p className="xp-popup-text">
          {taskTitle ? `Din inlämning för ”${taskTitle}” är godkänd.` : 'Din inlämning är godkänd.'}
        </p>
        <button type="button" className="btn btn-primary btn-md" onClick={onClose} autoFocus>
          Fortsätt
        </button>
      </div>
    </div>
  );
};
