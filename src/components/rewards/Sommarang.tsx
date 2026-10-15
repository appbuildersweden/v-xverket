import React, { useEffect, useState } from 'react';

/**
 * Den gulliga, levande sommarängen.
 *
 * En dekorativ scen — inte en spelvärld. allt är CSS/SVG med emoji som
 * platshållare för illustrationerna (inget bildgenereringssystem).
 * Animationerna är lugna, kör endast transform/opacity och respekterar
 * `prefers-reduced-motion`.
 */

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
  /** Upplåsta dekorationsföremål — avgör vad som visas i ängen. */
  items: Set<string>;
  /** Höjd på scenen i px. */
  height?: number;
}

const FLOWERS = [
  { left: 6, color: '#ff9ec7' },
  { left: 14, color: '#ffd166' },
  { left: 23, color: '#c9a7f5' },
  { left: 34, color: '#ff9ec7' },
  { left: 45, color: '#8fd3ff' },
  { left: 57, color: '#ffd166' },
  { left: 68, color: '#ff8fa3' },
  { left: 78, color: '#c9a7f5' },
  { left: 88, color: '#ffd166' },
  { left: 94, color: '#ff9ec7' },
];

export const Sommarang: React.FC<Props> = ({ items, height = 240 }) => {
  const reduced = usePrefersReducedMotion();
  const has = (k: string) => items.has(k);

  return (
    <div
      className={`ang ${reduced ? 'ang--still' : ''}`}
      style={{ height }}
      aria-hidden="true"
    >
      {/* Himmel och moln */}
      <div className="ang-sky" />
      <span className="ang-sol" />
      <span className="ang-moln ang-moln--1" />
      <span className="ang-moln ang-moln--2" />
      <span className="ang-moln ang-moln--3" />

      {/* Häxa på kvast i himlen */}
      <span className="ang-haxa">🧙‍♀️</span>

      {/* Kullar */}
      <span className="ang-kulle ang-kulle--1" />
      <span className="ang-kulle ang-kulle--2" />
      <span className="ang-gras" />

      {/* Blommor */}
      {FLOWERS.map((f, i) => (
        <span
          key={i}
          className="ang-blomma"
          style={{ left: `${f.left}%`, color: f.color }}
        >
          ✿
        </span>
      ))}

      {/* Staket + kor i hagen */}
      {has('hage') && (
        <>
          <span className="ang-staket" />
          <span className="ang-ko ang-ko--1">🐄</span>
          <span className="ang-ko ang-ko--2">🐄</span>
          {has('ko3') && <span className="ang-ko ang-ko--3">🐄</span>}
        </>
      )}

      {/* Tomte bakom svamp */}
      {has('tomte') && (
        <span className="ang-tomte-wrap">
          <span className="ang-tomte">🧍</span>
          <span className="ang-svamp">🍄</span>
        </span>
      )}

      {/* Påskhare som hoppar genom gräset */}
      {has('hare') && <span className="ang-hare">🐰</span>}

      {/* Fjärilar */}
      <span className="ang-fjaril ang-fjaril--1">🦋</span>
      <span className="ang-fjaril ang-fjaril--2">🦋</span>

      {/* Låsta dekorationer placeras i ängen */}
      {has('blomma') && <span className="ang-dk ang-dk--1">🌸</span>}
      {has('sol') && <span className="ang-dk ang-dk--2">🌻</span>}
      {has('stjarna') && <span className="ang-dk ang-dk--3">⭐</span>}
      {has('hjarta') && <span className="ang-dk ang-dk--4">💗</span>}
      {has('pumpa') && <span className="ang-dk ang-dk--5">🎃</span>}
      {has('spoke') && <span className="ang-dk ang-dk--6">👻</span>}
      {has('katt') && <span className="ang-dk ang-dk--7">🐈‍⬛</span>}
      {has('julgran') && <span className="ang-dk ang-dk--8">🎄</span>}
      {has('julkrans') && <span className="ang-dk ang-dk--9">🧧</span>}
      {has('pepparkakshus') && <span className="ang-dk ang-dk--10">🏠</span>}
    </div>
  );
};
