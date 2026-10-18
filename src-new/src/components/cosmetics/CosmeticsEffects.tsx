import React, { useEffect, useState } from 'react';
import { useCosmetics } from '../../lib/cosmetics';
import { halloweenIconFile } from '../../lib/halloween-icons';

/**
 * Visuell effekt från shopen.
 *
 * Effekten ritas ovanpå appen men tar aldrig emot klick, och den stängs av helt
 * när användaren har bett systemet om mindre rörelse — då syns ingen dimma, inga
 * spöken och inga stjärnfall, oavsett vad som är utrustat.
 */

/** Sant när användaren vill ha mindre rörelse. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const SLUGS = new Set(['effekt-dimman', 'effekt-spokparaden', 'effekt-stjarnfallet']);

export const CosmeticsEffects: React.FC = () => {
  const { equippedItem } = useCosmetics();
  const reduced = usePrefersReducedMotion();
  const effect = equippedItem('effekt');

  if (reduced) return null;
  if (!effect || !SLUGS.has(effect.slug)) return null;

  if (effect.slug === 'effekt-dimman') {
    return (
      <div className="kosmetik-effekt" aria-hidden="true" data-testid="kosmetik-effekt-dimma">
        <div className="kosmetik-dimma" />
      </div>
    );
  }

  if (effect.slug === 'effekt-spokparaden') {
    const ghost = halloweenIconFile('ikon-spoke');
    return (
      <div className="kosmetik-effekt" aria-hidden="true" data-testid="kosmetik-effekt-spoken">
        {[0, 1, 2].map((index) => (
          <React.Fragment key={index}>
            {ghost && (
              <img
                className="kosmetik-spoke"
                src={ghost}
                alt=""
                style={{
                  top: `${18 + index * 22}%`,
                  animationDelay: `${index * 9}s`,
                  animationDuration: `${30 + index * 6}s`,
                }}
              />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className="kosmetik-effekt" aria-hidden="true" data-testid="kosmetik-effekt-stjarnfall">
      {Array.from({ length: 8 }, (_, index) => (
        <span
          key={index}
          className="kosmetik-stjarna"
          style={{
            left: `${8 + index * 11}%`,
            animationDelay: `${index * 1.6}s`,
            animationDuration: `${8 + (index % 3) * 2}s`,
          }}
        />
      ))}
    </div>
  );
};
