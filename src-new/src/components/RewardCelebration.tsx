import React from 'react';
import { Sparkles, Star } from 'lucide-react';
import { UnlockCelebration } from '../lib/planner';
import { seasonArtKey } from '../lib/season';
import { RewardArt } from './halloween/RewardArt';
import { Modal } from './forms';

/** Små ljuspunkter som sprids ut från föremålet när det låses upp. */
const SPARKS = Array.from({ length: 10 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 10;
  const distance = 52 + (index % 3) * 16;
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance * 0.8) - 20,
    delay: (index % 5) * 0.08,
  };
});

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
            <div className="reward-popup-illu hh-celebrate" aria-hidden="true">
              {seasonArtKey(first.illustration) ? (
                <RewardArt artKey={first.illustration} size={104} />
              ) : (
                (first.illustration ?? '🏅')
              )}
              {SPARKS.map((spark, index) => (
                <span
                  key={`spark-${index}`}
                  className="hh-spark"
                  style={
                    {
                      '--spark-x': `${spark.x}px`,
                      '--spark-y': `${spark.y}px`,
                      '--spark-delay': `${spark.delay}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
            {first.description && <p className="reward-popup-desc">{first.description}</p>}
            {first.bonusXp > 0 && (
              <p className="reward-popup-desc">
                Bonus: {first.bonusXp} XP (utbetald av servern en gång).
              </p>
            )}
            {first.items.length > 0 && (
              <div className="reward-popup-items">
                {first.items.map((item) =>
                  seasonArtKey(item) ? (
                    <span className="reward-popup-item" key={item}>
                      <RewardArt artKey={item} size={34} />
                    </span>
                  ) : (
                    <span className="reward-popup-item" key={item}>
                      {item}
                    </span>
                  ),
                )}
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
