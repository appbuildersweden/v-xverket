import React from 'react';
import { Sparkles, Star } from 'lucide-react';
import { UnlockCelebration } from '../lib/planner';
import { Modal } from './forms';

interface Props {
  /** Upplåsta belöningar från servern (kan vara tom). */
  unlocks: readonly UnlockCelebration[];
  /** XP som betalades ut i samma åtgärd. */
  xpAwarded: number;
  onClose: () => void;
}

/**
 * Visar vad en slutförd uppgift gav. XP och upplåsningar kommer från servern —
 * rutan räknar inte ut någonting själv och kan därför inte visa fel summa.
 */
export const RewardCelebration: React.FC<Props> = ({ unlocks, xpAwarded, onClose }) => {
  const first = unlocks[0];
  const title = first ? `Ny belöning: ${first.name}` : 'Snyggt jobbat!';

  return (
    <Modal title={title} onClose={onClose} closeLabel="Stäng belöning">
      <div className="reward-celebration" data-testid="reward-celebration">
        {xpAwarded > 0 && (
          <div className="reward-popup-xp">
            <Star size={18} aria-hidden="true" /> +{xpAwarded} XP
          </div>
        )}

        {first && (
          <>
            <div className="reward-popup-illu" aria-hidden="true">
              {first.illustration ?? '🏅'}
            </div>
            {first.description && <p className="reward-popup-desc">{first.description}</p>}
            {first.bonusXp > 0 && (
              <p className="reward-popup-desc">
                Bonus: {first.bonusXp} XP (utbetald av servern en gång).
              </p>
            )}
            {first.items.length > 0 && (
              <div className="reward-popup-items">
                {first.items.map((item) => (
                  <span className="reward-popup-item" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            )}
            {unlocks.length > 1 && (
              <p className="reward-popup-desc">
                Och {unlocks.length - 1} belöning{unlocks.length - 1 === 1 ? '' : 'ar'} till.
              </p>
            )}
          </>
        )}

        {!first && xpAwarded === 0 && (
          <p className="reward-popup-desc">
            <Sparkles size={14} aria-hidden="true" /> Uppgiften är registrerad som klar.
          </p>
        )}

        <button type="button" className="btn btn-primary" onClick={onClose}>
          Fortsätt
        </button>
      </div>
    </Modal>
  );
};
