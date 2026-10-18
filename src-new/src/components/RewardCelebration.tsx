import React, { useEffect, useMemo, useRef } from 'react';
import { Sparkles, Star } from 'lucide-react';
import { UnlockCelebration } from '../lib/planner';
import { RARITY_META, normalizeRarity, seasonArtKey } from '../lib/season';
import { RewardArt } from './halloween/RewardArt';

/**
 * Firandet när en uppgift ger XP och låser upp nya föremål.
 *
 * Rutan räknar inte ut någonting själv: XP, upplåsningar och bonusar kommer
 * från servern. Det som är design är bara presentationen — ett varmt ljussken
 * kring föremålet, konfetti i säsongens färger och en tydlig rad om vad eleven
 * fick. Den som har reducerad rörelse påslagen får samma innehåll utan rörelse.
 */

/** Konfettibitar som faller över scenen. Determinism gör animationen stabil. */
const CONFETTI = Array.from({ length: 22 }, (_, index) => ({
  left: Math.round((index * 37 + (index % 4) * 11) % 96) + 2,
  delay: (index % 7) * 0.22,
  duration: 2.6 + ((index * 7) % 9) * 0.14,
  rotate: (index * 53) % 360,
  tint: index % 4,
  size: 6 + (index % 3) * 3,
}));

/** Små ljuspunkter som sprids ut från föremålet när det låses upp. */
const SPARKS = Array.from({ length: 12 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 12;
  const distance = 58 + (index % 3) * 18;
  return {
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance * 0.8) - 16,
    delay: (index % 5) * 0.09,
  };
});

interface Props {
  /** Upplåsta belöningar från servern (kan vara tom). */
  unlocks: readonly UnlockCelebration[];
  /** XP som betalades ut i samma åtgärd. */
  xpAwarded: number;
  onClose: () => void;
}

export const RewardCelebration: React.FC<Props> = ({ unlocks, xpAwarded, onClose }) => {
  const first = unlocks[0];
  const rest = unlocks.slice(1);
  const rarity = useMemo(
    () => (first?.rarity ? normalizeRarity(first.rarity) : null),
    [first?.rarity],
  );
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape stänger firandet, och fokus ligger på knappen så att tangentbordet
  // fungerar direkt.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const art = first ? seasonArtKey(first.illustration) : null;

  return (
    <div className="reward-stage" data-testid="reward-stage">
      <div className="reward-veil" aria-hidden="true" />

      <div
        className="reward-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reward-title"
        data-testid="reward-celebration"
      >
        {first && (
          <div className="reward-confetti" aria-hidden="true">
            {CONFETTI.map((bit, index) => (
              <span
                key={`confetti-${index}`}
                className={`reward-confetti-bit reward-confetti-${bit.tint}`}
                style={
                  {
                    left: `${bit.left}%`,
                    animationDelay: `${bit.delay}s`,
                    animationDuration: `${bit.duration}s`,
                    '--confetti-rotate': `${bit.rotate}deg`,
                    '--confetti-size': `${bit.size}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}

        <div className="reward-hero" aria-hidden="true">
          <span className="reward-ring reward-ring-outer" />
          <span className="reward-ring reward-ring-inner" />
          {first && (
            <div className="reward-art hh-celebrate">
              {art ? (
                <RewardArt artKey={art} size={128} />
              ) : (
                <span className="reward-art-fallback">{first.illustration ?? '🏅'}</span>
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
          )}
        </div>

        <div className="reward-copy">
          {first ? (
            <>
              <p className="reward-kicker">
                <Sparkles size={14} aria-hidden="true" /> Ny belöning: {first.name}
              </p>
              <h2 id="reward-title" className="reward-title">
                {first.name}
              </h2>
              <div className="reward-badges">
                {rarity && (
                  <span className={`hh-rarity hh-rarity-${rarity}`}>
                    {RARITY_META[rarity].label}
                  </span>
                )}
                {xpAwarded > 0 && (
                  <span className="reward-xp-badge">
                    <Star size={14} aria-hidden="true" /> +{xpAwarded} XP
                  </span>
                )}
                {first.bonusXp > 0 && (
                  <span className="reward-bonus-badge">Bonus {first.bonusXp} XP</span>
                )}
              </div>
              {first.description && <p className="reward-desc">{first.description}</p>}
              {first.items.length > 0 && (
                <div className="reward-items">
                  {first.items.map((item) =>
                    seasonArtKey(item) ? (
                      <span className="reward-item-chip" key={item}>
                        <RewardArt artKey={item} size={30} />
                      </span>
                    ) : (
                      <span className="reward-item-chip reward-item-text" key={item}>
                        {item}
                      </span>
                    ),
                  )}
                </div>
              )}
              {rest.length > 0 && (
                <div className="reward-more">
                  <span className="reward-more-label">
                    Dessutom upplåst ({rest.length})
                  </span>
                  <ul className="reward-more-list">
                    {rest.map((unlock) => {
                      const restArt = seasonArtKey(unlock.illustration);
                      return (
                        <li key={unlock.id}>
                          {restArt ? (
                            <RewardArt artKey={restArt} size={26} />
                          ) : (
                            <Sparkles size={14} aria-hidden="true" />
                          )}
                          <span>{unlock.name}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="reward-kicker">
                <Sparkles size={14} aria-hidden="true" /> Uppgiften är klar
              </p>
              <h2 id="reward-title" className="reward-title">
                Snyggt jobbat!
              </h2>
              {xpAwarded > 0 ? (
                <div className="reward-badges">
                  <span className="reward-xp-badge">
                    <Star size={14} aria-hidden="true" /> +{xpAwarded} XP
                  </span>
                </div>
              ) : (
                <p className="reward-desc">Uppgiften är registrerad som klar.</p>
              )}
              <p className="reward-desc">
                Poängen är redan insatta. Nästa föremål i trädgården väntar vid nästa
                XP-gräns.
              </p>
            </>
          )}
        </div>

        <button
          ref={closeRef}
          type="button"
          className="btn btn-primary reward-continue"
          onClick={onClose}
        >
          Fortsätt
        </button>
      </div>
    </div>
  );
};
