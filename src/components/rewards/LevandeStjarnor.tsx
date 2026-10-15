import React, { useEffect, useMemo, useState } from 'react';

/**
 * Levande stjärnor — riktiga animerade element, inte statiska bilder.
 *
 * Enligt motion-ref (ref/11-ambient.md): partiklar ska "långsamt stiga och
 * sväva". Vi genererar stjärnor med varierande storlek, hastighet, riktning
 * och starttid så att loopen aldrig ser stel eller synkroniserad ut.
 *
 * Allt görs med transform/opacity (GPU-komposit), aldrig med layout. När
 * `prefers-reduced-motion: reduce` är satt renderas inga stjärnor alls.
 */

interface Star {
  id: number;
  left: number;      // 0–100 %
  size: number;      // px
  duration: number;  // sekunder
  delay: number;     // sekunder
  drift: number;     // px horisontell svävning
  kind: 'twinkle' | 'float' | 'spin';
  shape: 'star' | 'dot' | 'heart';
  color: string;
  burst: boolean;    // extra festlig variant
}

const COLORS = ['#fff8d6', '#ffe9a8', '#ffffff', '#ffe3ef', '#d9f3ff'];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStars(count: number, seed: number, burst: boolean): Star[] {
  const rnd = mulberry32(seed);
  const kinds: Star['kind'][] = ['twinkle', 'float', 'spin'];
  const shapes: Star['shape'][] = ['star', 'star', 'dot', 'heart'];
  return Array.from({ length: count }, (_, i) => ({
    id: seed * 1000 + i,
    left: rnd() * 100,
    size: burst ? 6 + rnd() * 12 : 4 + rnd() * 9,
    duration: burst ? 1.6 + rnd() * 2.4 : 3.5 + rnd() * 5.5,
    delay: burst ? rnd() * 1.2 : rnd() * 8,
    drift: (rnd() - 0.5) * (burst ? 160 : 60),
    kind: kinds[Math.floor(rnd() * kinds.length)],
    shape: shapes[Math.floor(rnd() * shapes.length)],
    color: COLORS[Math.floor(rnd() * COLORS.length)],
    burst,
  }));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

interface Props {
  /** Antal stjärnor i normalt läge. */
  count?: number;
  /** Extra festlig variant — används när en belöning låses upp. */
  burst?: boolean;
  /** Extra antal i burst-läge. */
  burstCount?: number;
  /** Overlay-läge: fyller hela föräldern med pekare avstängda. */
  overlay?: boolean;
  className?: string;
}

export const LevandeStjarnor: React.FC<Props> = ({
  count = 26,
  burst = false,
  burstCount = 46,
  overlay = false,
  className = '',
}) => {
  const reduced = usePrefersReducedMotion();

  const stars = useMemo(
    () => makeStars(burst ? burstCount : count, burst ? 77 : 13, burst),
    [count, burstCount, burst],
  );

  // Burst-stjärnor rensas efter att de har svävat ut.
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!burst) {
      setVisible(true);
      return;
    }
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 5200);
    return () => window.clearTimeout(t);
  }, [burst]);

  if (reduced) return null;
  if (!visible) return null;

  return (
    <div
      className={`starfield ${overlay ? 'starfield--overlay' : ''} ${className}`}
      aria-hidden="true"
    >
      {stars.map((s) => (
        <span
          key={s.id}
          className={`star star--${s.kind} star--${s.shape} ${burst ? 'star--burst' : ''}`}
          style={
            {
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              color: s.color,
              backgroundColor: s.shape === 'dot' ? s.color : undefined,
              ['--dur' as string]: `${s.duration}s`,
              ['--delay' as string]: `${s.delay}s`,
              ['--drift' as string]: `${s.drift}px`,
            } as React.CSSProperties
          }
        >
          {s.shape === 'dot' ? '' : s.shape === 'heart' ? '♥' : '★'}
        </span>
      ))}
      {/* Glittrande partiklar som dyker upp och försvinner */}
      {Array.from({ length: burst ? 24 : 10 }, (_, i) => {
        const rnd = mulberry32((burst ? 991 : 313) + i * 17);
        return (
          <span
            key={`p${i}`}
            className="sparkle"
            style={
              {
                left: `${rnd() * 100}%`,
                top: `${rnd() * 100}%`,
                width: 2 + rnd() * 3,
                height: 2 + rnd() * 3,
                ['--dur' as string]: `${2.5 + rnd() * 4}s`,
                ['--delay' as string]: `${rnd() * 6}s`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
};

/** Konfetti och hjärtan som sprids ut från belöningsrutan. */
export const KonfettiExplosion: React.FC = () => {
  const reduced = usePrefersReducedMotion();
  const pieces = useMemo(() => {
    const rnd = mulberry32(4242);
    return Array.from({ length: 44 }, (_, i) => {
      const angle = (i / 44) * Math.PI * 2 + rnd() * 0.4;
      const dist = 110 + rnd() * 190;
      return {
        id: i,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist + 60,
        rot: (rnd() - 0.5) * 720,
        size: 6 + rnd() * 9,
        color: ['#ffd94a', '#ffffff', '#ff8fb1', '#8fe3ff', '#c6f7b0'][
          Math.floor(rnd() * 5)
        ],
        heart: rnd() > 0.72,
        delay: rnd() * 0.25,
      };
    });
  }, []);

  if (reduced) return null;

  return (
    <div className="konfetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="konfetti-piece"
          style={
            {
              '--tx': `${p.tx}px`,
              '--ty': `${p.ty}px`,
              '--rot': `${p.rot}deg`,
              '--size': `${p.size}px`,
              '--delay': `${p.delay}s`,
              backgroundColor: p.color,
            } as React.CSSProperties
          }
        >
          {p.heart ? '♥' : ''}
        </span>
      ))}
    </div>
  );
};
