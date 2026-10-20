import React, { useId } from 'react';
import type { HalloweenPart } from '../../lib/halloween';

/**
 * Den lagrade Halloween-avataren.
 *
 * Allt ritas som SVG i stället för att laddas som bilder: delarna kan då
 * kombineras fritt, följa hud- och hårfärgen och skalas utan att bli suddiga.
 *
 * Renderingen är lagerbaserad och modellerad med ljus i stället för platta
 * färgytor: hud, hår och iris har gradienter, kindben och haka får mjuk
 * skugga, och en kall kantljus-strimma längs höger sida gör att figuren läser
 * som en rundad form mot den mörka bakgrunden. Ritordningen är fast –
 * bakgrund, skugga, hår baktill, kropp, huvud, ansikte, hår framtill,
 * huvudbonad, mask, glasögon, effekt – så att en hatt aldrig hamnar bakom
 * huvudet och ett långt hår faller över axlarna i stället för under dem.
 *
 * Okända nycklar (t.ex. en del som avpublicerats) ritas inte alls; avataren
 * faller då tillbaka på sina standardval i stället för att bli tom.
 */

const SKIN_FALLBACK = '#d6a37e';
const HAIR_FALLBACK = '#4a3324';
const EYE_FALLBACK = '#39804b';

interface Palette {
  skin: string;
  skinShade: string;
  skinLine: string;
  hair: string;
  hairLight: string;
  eye: string;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Mörkare variant av en hex-färg, för skuggor och konturer. */
export function shade(hex: string, amount: number): string {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#888888';
  const num = parseInt(clean.slice(1), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const factor = 1 - Math.max(0, Math.min(1, amount));
  return `#${[clampChannel(r * factor), clampChannel(g * factor), clampChannel(b * factor)]
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Ljusare variant, för hårglans och hudens ljuskant. */
export function lighten(hex: string, amount: number): string {
  return shade(hex, -Math.abs(amount));
}

function colorOf(parts: readonly HalloweenPart[], look: Record<string, string>, slot: string): string | null {
  const slug = look[slot];
  if (!slug) return null;
  const part = parts.find((row) => row.slug === slug);
  return part?.color ?? null;
}

function partOf(
  parts: readonly HalloweenPart[],
  look: Record<string, string>,
  slot: string,
): HalloweenPart | null {
  const slug = look[slot];
  if (!slug) return null;
  return parts.find((row) => row.slug === slug) ?? null;
}

function paletteFor(parts: readonly HalloweenPart[], look: Record<string, string>): Palette {
  const skin = colorOf(parts, look, 'hudton') ?? SKIN_FALLBACK;
  const hair = colorOf(parts, look, 'harfarg') ?? HAIR_FALLBACK;
  return {
    skin,
    skinShade: shade(skin, 0.14),
    skinLine: shade(skin, 0.3),
    hair,
    hairLight: lighten(hair, 0.3),
    eye: colorOf(parts, look, 'ogonfarg') ?? EYE_FALLBACK,
  };
}

/* --------------------------------------------------------------- bakgrund */

const Scene: React.FC<{ slug: string | null; uid: string }> = ({ slug, uid }) => {
  if (!slug) return null;

  if (slug === 'bg-maneskog') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-skog`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22303d" />
            <stop offset="52%" stopColor="#16202a" />
            <stop offset="100%" stopColor="#0b1116" />
          </linearGradient>
          <radialGradient id={`${uid}-skog-mist`} cx="50%" cy="82%" r="60%">
            <stop offset="0%" stopColor="#9fb6c2" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#9fb6c2" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-skog)`} />
        <radialGradient id={`${uid}-manglans`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2ecd8" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#f2ecd8" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#f2ecd8" stopOpacity="0" />
        </radialGradient>
        <circle cx="186" cy="46" r="44" fill={`url(#${uid}-manglans)`} />
        <circle cx="186" cy="46" r="20" fill="#f1ebd8" />
        <circle cx="179" cy="40" r="3.8" fill="#dbd3ba" opacity="0.45" />
        <circle cx="192" cy="51" r="2.8" fill="#dbd3ba" opacity="0.35" />
        <circle cx="188" cy="35" r="2.1" fill="#dbd3ba" opacity="0.3" />
        {[
          [20, 240, 0.9],
          [42, 226, 0.7],
          [196, 232, 0.8],
          [220, 214, 0.55],
        ].map(([x, base, opacity], index) => (
          <g key={x} opacity={opacity} fill="#081014">
            <path d={`M${x} ${base} l-7 -104 l15 0 Z`} />
            <path d={`M${x - 4} ${base - 62} l-24 -16 l22 30 Z`} />
            <path d={`M${x + 4} ${base - 78} l24 -18 l-22 32 Z`} />
            <ellipse cx={x} cy={base} rx={26 - index * 3} ry="6" />
          </g>
        ))}
        <path d="M0 214 C40 200 80 222 120 208 C160 194 200 216 240 204 L240 240 L0 240 Z" fill="#080e12" />
        <ellipse cx="120" cy="196" rx="120" ry="60" fill={`url(#${uid}-skog-mist)`} />
      </g>
    );
  }

  if (slug === 'bg-spokhus') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-hus`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22304a" />
            <stop offset="100%" stopColor="#0b1220" />
          </linearGradient>
          <radialGradient id={`${uid}-hus-glod`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffd489" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffd489" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-hus)`} />
        <circle cx="52" cy="46" r="17" fill="#dfe6f2" opacity="0.9" />
        <circle cx="52" cy="46" r="30" fill="#dfe6f2" opacity="0.07" />
        <path d="M96 202 L96 122 L120 96 L144 122 L144 202 Z" fill="#182233" />
        <path d="M86 124 L120 86 L154 124 Z" fill="#101828" />
        <path d="M112 202 L112 176 L128 176 L128 202 Z" fill="#0a0f18" />
        <rect x="104" y="140" width="13" height="18" rx="1.5" fill="#f6c979" opacity="0.92" />
        <rect x="125" y="162" width="12" height="14" rx="1.5" fill="#f6c979" opacity="0.45" />
        <ellipse cx="110" cy="149" rx="30" ry="22" fill={`url(#${uid}-hus-glod)`} />
        {[26, 58].map((x) => (
          <path key={x} d={`M${x} 206 L${x} 152 M${x} 168 l-10 -12 M${x} 180 l-8 -8`} stroke="#1b2635" strokeWidth="3" fill="none" />
        ))}
        <path d="M0 204 C60 190 150 214 240 198 L240 240 L0 240 Z" fill="#080e18" />
        <path d="M212 240 L212 178" stroke="#1f2c3d" strokeWidth="3" />
        <path d="M204 182 L220 182" stroke="#1f2c3d" strokeWidth="3" />
      </g>
    );
  }

  if (slug === 'bg-pumpafalt') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-falt`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2c1822" />
            <stop offset="55%" stopColor="#3a1f1a" />
            <stop offset="100%" stopColor="#160d11" />
          </linearGradient>
          <radialGradient id={`${uid}-falt-ljus`} cx="82%" cy="18%" r="48%">
            <stop offset="0%" stopColor="#ffce8a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffce8a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-falt)`} />
        <rect width="240" height="240" fill={`url(#${uid}-falt-ljus)`} />
        <circle cx="196" cy="44" r="18" fill="#f8dca8" opacity="0.75" />
        {[
          [30, 212, 15],
          [62, 206, 10],
          [176, 212, 17],
          [210, 202, 11],
        ].map(([cx, cy, r]) => (
          <g key={`${cx}-${cy}`}>
            <ellipse cx={cx + 2} cy={cy + 4} rx={r} ry={r * 0.35} fill="#0b0709" opacity="0.5" />
            <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.86} fill="#a94f18" />
            <ellipse cx={cx} cy={cy} rx={r * 0.62} ry={r * 0.6} fill="#c96a22" />
            <ellipse cx={cx - r * 0.24} cy={cy - r * 0.28} rx={r * 0.26} ry={r * 0.2} fill="#f0a95c" opacity="0.5" />
            <path d={`M${cx} ${cy - r} l-2 -8 l5 1`} stroke="#4a5c2a" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        ))}
        <path d="M0 206 C60 196 180 218 240 204 L240 240 L0 240 Z" fill="#100809" />
        <ellipse cx="120" cy="212" rx="130" ry="26" fill="#3c1f22" opacity="0.35" />
      </g>
    );
  }

  if (slug === 'bg-gravgard') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-grav`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16242a" />
            <stop offset="70%" stopColor="#0d1618" />
            <stop offset="100%" stopColor="#070d0e" />
          </linearGradient>
          <linearGradient id={`${uid}-sten`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#5a6a66" />
            <stop offset="100%" stopColor="#2c3a38" />
          </linearGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-grav)`} />
        <circle cx="42" cy="42" r="15" fill="#cfe0dc" opacity="0.4" />
        <circle cx="42" cy="42" r="26" fill="#cfe0dc" opacity="0.05" />
        {[
          [46, 188, 13],
          [86, 196, 9],
          [172, 186, 15],
        ].map(([x, y, w]) => (
          <g key={x}>
            <ellipse cx={x + 3} cy={y + 36} rx={w * 0.9} ry="4" fill="#050a0b" opacity="0.6" />
            <path d={`M${x - w / 2} ${y + 34} V${y} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V${y + 34} Z`} fill={`url(#${uid}-sten)`} />
            <path d={`M${x - w / 2 + 3} ${y + 2} a${w / 2 - 3} ${w / 2 - 3} 0 0 1 ${w - 6} 0`} fill="none" stroke="#7b8a86" strokeWidth="1.4" opacity="0.35" />
            <path d={`M${x - w / 4} ${y + 10} h${w / 2}`} stroke="#26332f" strokeWidth="2" opacity="0.8" />
          </g>
        ))}
        <path d="M226 240 L226 150" stroke="#26332f" strokeWidth="4" />
        <path d="M213 152 L239 152" stroke="#26332f" strokeWidth="3" />
        <path d="M0 200 C70 192 170 208 240 198 L240 240 L0 240 Z" fill="#080f10" />
        <ellipse cx="120" cy="212" rx="120" ry="24" fill="#8fa39f" opacity="0.06" />
      </g>
    );
  }

  if (slug === 'bg-stjarnhimmel') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-himmel`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1836" />
            <stop offset="55%" stopColor="#122040" />
            <stop offset="100%" stopColor="#1b2a3f" />
          </linearGradient>
          <linearGradient id={`${uid}-norr`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5bd6b0" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#5bd6b0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-himmel)`} />
        <path d="M40 0 C70 60 100 70 130 40 C160 10 190 20 220 0 L240 0 L240 120 C200 90 150 110 100 80 C70 62 50 40 40 0 Z" fill={`url(#${uid}-norr)`} />
        {[
          [28, 34, 1.8],
          [62, 18, 1.1],
          [96, 42, 1.4],
          [140, 24, 1.8],
          [176, 52, 1.1],
          [206, 30, 1.4],
          [120, 66, 1.1],
          [44, 78, 1.2],
          [214, 86, 1.6],
          [86, 96, 1],
          [16, 58, 1],
          [156, 74, 1.2],
        ].map(([cx, cy, r], index) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#eef2ff" opacity={0.45 + (index % 4) * 0.14} />
        ))}
        <path d="M0 198 C70 170 150 190 240 158 L240 240 L0 240 Z" fill="#0a1424" />
        <path d="M12 186 C60 168 120 182 190 162" stroke="#6d9ec7" strokeWidth="2" opacity="0.4" fill="none" />
        <path d="M0 214 C60 198 170 220 240 206 L240 240 L0 240 Z" fill="#070f1b" />
      </g>
    );
  }

  if (slug === 'bg-haxkok') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-kok`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#241a13" />
            <stop offset="100%" stopColor="#100b08" />
          </linearGradient>
          <radialGradient id={`${uid}-kok-glod`} cx="80%" cy="72%" r="42%">
            <stop offset="0%" stopColor="#8ee07a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#8ee07a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${uid}-hylla`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4b3626" />
            <stop offset="100%" stopColor="#2a1d14" />
          </linearGradient>
        </defs>
        <rect width="240" height="240" fill={`url(#${uid}-kok)`} />
        <rect width="240" height="240" fill={`url(#${uid}-kok-glod)`} />
        <rect x="10" y="58" width="78" height="6" rx="2" fill={`url(#${uid}-hylla)`} />
        {[18, 30, 42, 54, 66].map((x, index) => (
          <g key={x}>
            <rect x={x} y={34 + (index % 2) * 8} width="7" height="22" rx="2.5" fill="#4a3524" />
            <rect x={x + 1} y={36 + (index % 2) * 8} width="2" height="16" rx="1" fill="#6f5438" opacity="0.5" />
          </g>
        ))}
        <ellipse cx="192" cy="198" rx="34" ry="9" fill="#0c0806" />
        <path d="M162 198 h60 l-8 -30 h-44 Z" fill="#2a2119" />
        <path d="M170 192 h44" stroke="#443425" strokeWidth="2" opacity="0.7" />
        <ellipse cx="192" cy="168" rx="19" ry="7" fill="#4f8a4a" />
        <ellipse cx="192" cy="168" rx="13" ry="4" fill="#76c46a" opacity="0.8" />
        <circle cx="186" cy="162" r="3.4" fill="#9fe08c" opacity="0.7" className="avatar-ember" />
        <circle cx="198" cy="157" r="2.4" fill="#9fe08c" opacity="0.5" className="avatar-ember avatar-ember-1" />
        <circle cx="193" cy="150" r="1.8" fill="#9fe08c" opacity="0.35" className="avatar-ember avatar-ember-2" />
        <rect x="118" y="118" width="28" height="36" rx="4" fill="#3a2a1e" />
        <rect x="122" y="122" width="20" height="28" rx="2" fill="#d9b26a" opacity="0.3" />
        <path d="M132 122 v28" stroke="#2a1d14" strokeWidth="1.4" opacity="0.7" />
        <path d="M0 214 C70 206 170 220 240 210 L240 240 L0 240 Z" fill="#0d0906" />
      </g>
    );
  }

  return null;
};

/* ------------------------------------------------------------------ effekt */

const Effects: React.FC<{ slug: string | null; behind?: boolean }> = ({ slug, behind }) => {
  if (!slug) return null;

  if (slug === 'fx-glod') {
    const points = behind
      ? [
          [34, 192, 2.4],
          [58, 168, 1.8],
          [204, 178, 2.2],
          [186, 214, 1.6],
        ]
      : [
          [30, 206, 2.6],
          [72, 146, 1.8],
          [150, 128, 1.6],
          [208, 198, 2.2],
          [96, 212, 1.4],
          [164, 222, 1.8],
        ];
    return (
      <g aria-hidden className="avatar-embers">
        {points.map(([cx, cy, r], index) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="#ffb347"
            opacity={0.55 + (index % 3) * 0.12}
            className={`avatar-ember avatar-ember-${index % 3}`}
          />
        ))}
      </g>
    );
  }

  if (slug === 'fx-dimma') {
    return (
      <g aria-hidden opacity="0.6">
        <ellipse cx="70" cy="216" rx="80" ry="13" fill="#c3d3da" opacity="0.2" />
        <ellipse cx="172" cy="226" rx="90" ry="15" fill="#c3d3da" opacity="0.16" />
        <ellipse cx="120" cy="206" rx="112" ry="10" fill="#c3d3da" opacity="0.12" />
        <ellipse cx="96" cy="232" rx="104" ry="12" fill="#c3d3da" opacity="0.1" />
      </g>
    );
  }

  if (slug === 'fx-stjarnfall') {
    return (
      <g aria-hidden>
        {[
          [52, 60],
          [172, 48],
          [198, 106],
        ].map(([x, y], index) => (
          <g key={`${x}-${y}`} className="avatar-star" opacity={0.85 - index * 0.15}>
            <path
              d={`M${x} ${y} l3.4 8 l8 3.4 l-8 3.4 l-3.4 8 l-3.4 -8 l-8 -3.4 l8 -3.4 Z`}
              fill="#f8ecc9"
            />
            <path d={`M${x + 9} ${y + 9} l16 20`} stroke="#f8ecc9" strokeWidth="1.3" opacity="0.4" />
          </g>
        ))}
      </g>
    );
  }

  if (slug === 'fx-fladdermussvarm') {
    return (
      <g aria-hidden fill="#141019" opacity="0.9" className="avatar-bats">
        {[
          [40, 58, 0.8],
          [196, 44, 0.62],
          [176, 82, 0.46],
        ].map(([x, y, scale]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${scale})`}>
            <path d="M0 0 C-8 -9 -19 -7 -23 2 C-16 0 -12 5 -10 9 C-6 4 0 6 0 13 C0 6 6 4 10 9 C12 5 16 0 23 2 C19 -7 8 -9 0 0 Z" />
          </g>
        ))}
      </g>
    );
  }

  return null;
};

/* ---------------------------------------------------------------- husdjur */

const Pet: React.FC<{ slug: string | null; uid: string }> = ({ slug, uid }) => {
  if (!slug) return null;

  if (slug === 'pet-katt') {
    return (
      <g aria-hidden transform="translate(176 176)">
        <defs>
          <radialGradient id={`${uid}-katt`} cx="34%" cy="26%" r="80%">
            <stop offset="0%" stopColor="#4a4358" />
            <stop offset="60%" stopColor="#2a2536" />
            <stop offset="100%" stopColor="#161320" />
          </radialGradient>
        </defs>
        <ellipse cx="0" cy="42" rx="26" ry="7" fill="#04040a" opacity="0.55" />
        <path d="M-16 40 C-19 20 -11 6 0 6 C11 6 19 20 16 40 Z" fill={`url(#${uid}-katt)`} />
        <path d="M13 36 C27 34 30 16 21 12" stroke="#2a2536" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M21 12 C25 14 25 20 21 22" stroke="#3b3448" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="0" cy="0" r="14" fill={`url(#${uid}-katt)`} />
        <path d="M-13 -6 l-3 -14 l11 8 Z" fill="#2a2536" />
        <path d="M13 -6 l3 -14 l-11 8 Z" fill="#2a2536" />
        <path d="M-12 -8 l-1.6 -8 l6 4.6 Z" fill="#5a4a55" opacity="0.8" />
        <path d="M12 -8 l1.6 -8 l-6 4.6 Z" fill="#5a4a55" opacity="0.8" />
        <ellipse cx="-5.4" cy="-1" rx="3.1" ry="3.6" fill="#f4c64f" />
        <ellipse cx="5.4" cy="-1" rx="3.1" ry="3.6" fill="#f4c64f" />
        <ellipse cx="-5.4" cy="-1" rx="1.1" ry="3" fill="#151119" />
        <ellipse cx="5.4" cy="-1" rx="1.1" ry="3" fill="#151119" />
        <circle cx="-6.3" cy="-2.2" r="0.9" fill="#fff" opacity="0.85" />
        <circle cx="4.5" cy="-2.2" r="0.9" fill="#fff" opacity="0.85" />
        <path d="M-1.4 5 l1.4 1.4 l1.4 -1.4" stroke="#0f0d15" strokeWidth="1.1" fill="none" />
        <path d="M-4 8 q4 3.4 8 0" stroke="#141019" strokeWidth="1.1" fill="none" />
        {[-16, -12, 12, 16].map((x) => (
          <path key={x} d={`M${x * 0.8} 4 l${x} ${x > 0 ? -1 : 1}`} stroke="#8b8296" strokeWidth="0.7" opacity="0.55" />
        ))}
      </g>
    );
  }

  if (slug === 'pet-fladdermus') {
    return (
      <g aria-hidden transform="translate(198 52)">
        <defs>
          <linearGradient id={`${uid}-bat`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b3348" />
            <stop offset="100%" stopColor="#1b1726" />
          </linearGradient>
        </defs>
        <path d="M0 0 v10" stroke="#2a2433" strokeWidth="2" />
        <path
          d="M0 10 C-10 0 -23 2 -26 13 C-18 9 -13 14 -11 19 C-7 13 0 15 0 23 C0 15 7 13 11 19 C13 14 18 9 26 13 C23 2 10 0 0 10 Z"
          fill={`url(#${uid}-bat)`}
        />
        <path d="M0 12 v10" stroke="#0f0c16" strokeWidth="1" opacity="0.5" />
        <circle cx="-4.6" cy="14" r="1.5" fill="#f4c04f" />
        <circle cx="4.6" cy="14" r="1.5" fill="#f4c04f" />
      </g>
    );
  }

  if (slug === 'pet-spoke') {
    return (
      <g aria-hidden transform="translate(188 148)" className="avatar-spoke-pet">
        <defs>
          <linearGradient id={`${uid}-spoke`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#dcd7ea" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#a79fbe" stopOpacity="0.65" />
          </linearGradient>
        </defs>
        <ellipse cx="0" cy="46" rx="18" ry="5" fill="#05050b" opacity="0.35" />
        <path
          d="M-19 34 C-23 8 -11 -9 0 -9 C12 -9 23 8 19 34 C13 30 9 37 3 31 C-3 37 -9 30 -19 34 Z"
          fill={`url(#${uid}-spoke)`}
        />
        <path d="M-13 32 C-12 18 -8 6 0 4" stroke="#ffffff" strokeWidth="1.6" opacity="0.45" fill="none" />
        <ellipse cx="-6.4" cy="8" rx="2.8" ry="3.8" fill="#2a2433" />
        <ellipse cx="6.4" cy="8" rx="2.8" ry="3.8" fill="#2a2433" />
        <circle cx="-7.4" cy="6.6" r="0.9" fill="#f4efff" opacity="0.6" />
        <circle cx="5.4" cy="6.6" r="0.9" fill="#f4efff" opacity="0.6" />
        <path d="M-4 16 q4 4.4 8 0" stroke="#2a2433" strokeWidth="1.5" fill="none" />
      </g>
    );
  }

  if (slug === 'pet-korp') {
    return (
      <g aria-hidden transform="translate(166 148)">
        <defs>
          <linearGradient id={`${uid}-korp`} x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0%" stopColor="#3a3348" />
            <stop offset="55%" stopColor="#221d2e" />
            <stop offset="100%" stopColor="#121019" />
          </linearGradient>
        </defs>
        <ellipse cx="2" cy="30" rx="16" ry="4" fill="#04040a" opacity="0.45" />
        <ellipse cx="0" cy="0" rx="14" ry="17" fill={`url(#${uid}-korp)`} />
        <path d="M-8 -8 C-2 -14 6 -12 10 -6" stroke="#4a4157" strokeWidth="2" fill="none" opacity="0.7" />
        <circle cx="4" cy="-15" r="9" fill={`url(#${uid}-korp)`} />
        <path d="M11 -14 l11 3.4 l-11 4 Z" fill="#e0a83c" />
        <path d="M11 -13 l9 2.8" stroke="#f4cd76" strokeWidth="1" opacity="0.7" />
        <circle cx="6" cy="-17" r="1.9" fill="#f4efe2" />
        <circle cx="6.3" cy="-17" r="0.9" fill="#111" />
        <path d="M-10 12 l-4 15 M4 15 l2 13" stroke="#e0a83c" strokeWidth="2" strokeLinecap="round" />
        <path d="M-14 22 l4 1 M6 28 l3 0" stroke="#c08f2f" strokeWidth="2" strokeLinecap="round" />
      </g>
    );
  }

  return null;
};

/* ------------------------------------------------------------------ kropp */

const Clothes: React.FC<{ slug: string | null; palette: Palette }> = ({ slug, palette }) => {
  const neck = (
    <g>
      <path d="M108 130 h24 v30 c0 7 -5 11 -12 11 c-7 0 -12 -4 -12 -11 Z" fill={palette.skinShade} />
      <path d="M108 130 h24 v9 c-8 5 -16 5 -24 0 Z" fill={shade(palette.skin, 0.36)} opacity="0.6" />
      <path d="M129 136 c2 14 1 26 -3 33 h8 v-33 Z" fill={shade(palette.skin, 0.24)} opacity="0.4" />
      <path d="M111 152 c5 3 13 3 18 0" stroke={shade(palette.skin, 0.3)} strokeWidth="1.2" fill="none" opacity="0.22" />
    </g>
  );

  const shoulders = (fill: string, rim = 'rgba(255,255,255,0.16)') => (
    <g>
      <path d="M52 240 C54 205 80 176 120 176 C160 176 186 205 188 240 Z" fill={fill} />
      <path d="M56 240 C58 210 76 186 104 178 C82 192 70 214 68 240 Z" fill="rgba(255,255,255,0.07)" />
      <path d="M184 240 C182 210 164 186 136 178 C158 192 170 214 172 240 Z" fill="rgba(0,0,0,0.2)" />
      <path d="M140 178 C166 190 180 212 182 240" stroke={rim} strokeWidth="1.6" fill="none" opacity="0.55" />
      <path d="M70 240 C76 218 88 200 104 190" stroke="rgba(0,0,0,0.16)" strokeWidth="2" fill="none" opacity="0.7" />
      <path d="M170 240 C164 218 152 200 136 190" stroke="rgba(0,0,0,0.14)" strokeWidth="2" fill="none" opacity="0.6" />
    </g>
  );

  if (slug === 'klad-pumpatroja') {
    return (
      <g aria-hidden>
        {neck}
        {shoulders('#a1511d')}
        <path d="M86 178 C98 192 142 192 154 178 C146 168 94 168 86 178 Z" fill="#8a3f14" />
        <path d="M86 178 C98 190 142 190 154 178" stroke="#c96a2a" strokeWidth="4" fill="none" opacity="0.65" />
        <path d="M88 182 C100 194 140 194 152 182" stroke="#74300c" strokeWidth="1.6" fill="none" opacity="0.5" />
        {[94, 104, 136, 146].map((x, index) => (
          <path key={x} d={`M${x} 198 q${index % 2 ? 3 : -3} 22 0 40`} stroke="#7d3a12" strokeWidth="2.2" fill="none" opacity="0.4" />
        ))}
        <ellipse cx="120" cy="214" rx="18" ry="16" fill="#c4681f" />
        <ellipse cx="114" cy="211" rx="6.5" ry="10" fill="#d97c2c" opacity="0.65" />
        <ellipse cx="126" cy="211" rx="6.5" ry="10" fill="#b25a18" opacity="0.55" />
        <path d="M120 200 v-6" stroke="#4d7a32" strokeWidth="4" strokeLinecap="round" />
        <path d="M120 196 C124 192 129 194 130 197 C126 199 122 199 120 196 Z" fill="#5d7d3a" />
        <path d="M120 214 l-5 4 l5 5 M120 214 l5 4 l-5 5" stroke="#4a2a0d" strokeWidth="1.8" fill="none" />
      </g>
    );
  }

  if (slug === 'klad-spokdrakt') {
    return (
      <g aria-hidden>
        {neck}
        <g>
          <path
            d="M50 240 C52 202 78 174 120 174 C162 174 188 202 190 240 C176 232 162 241 148 237 C136 233 128 241 120 237 C112 241 104 233 92 237 C78 241 64 232 50 240 Z"
            fill="#ece9f4"
          />
          <path d="M56 235 C64 214 76 196 96 184 C80 202 70 220 66 240 Z" fill="#ffffff" opacity="0.35" />
          <path d="M180 235 C172 214 160 196 144 186 C160 204 172 220 176 240 Z" fill="#a8a2ba" opacity="0.35" />
          <path d="M96 188 C104 206 108 222 106 240 M144 188 C136 206 132 222 134 240" stroke="#bdb7cd" strokeWidth="1.6" fill="none" opacity="0.5" />
          <circle cx="114" cy="208" r="2.4" fill="#8f89a3" opacity="0.35" />
          <circle cx="130" cy="224" r="1.8" fill="#8f89a3" opacity="0.3" />
        </g>
      </g>
    );
  }

  if (slug === 'klad-vampyrkappa') {
    return (
      <g aria-hidden>
        {neck}
        <path d="M38 240 C42 200 74 170 120 170 C166 170 198 200 202 240 Z" fill="#1d1727" />
        <path d="M38 240 C30 196 60 170 96 176 L88 240 Z" fill="#2a2236" />
        <path d="M202 240 C210 196 180 170 144 176 L152 240 Z" fill="#2a2236" />
        <path d="M88 180 L120 206 L152 180 C142 170 98 170 88 180 Z" fill="#7d1f2f" />
        <path d="M92 178 C104 190 136 190 148 178 C140 172 100 172 92 178 Z" fill="#a52a3d" opacity="0.6" />
        <path d="M98 182 L120 200 L142 182" stroke="#c9a227" strokeWidth="1.8" fill="none" opacity="0.8" />
        <path d="M150 182 C176 192 188 214 190 240" stroke="#544768" strokeWidth="1.4" fill="none" opacity="0.8" />
        <path d="M60 198 C54 212 52 228 52 240" stroke="#3d334d" strokeWidth="1.2" fill="none" opacity="0.6" />
        <path d="M120 206 v34" stroke="#141019" strokeWidth="1.4" opacity="0.5" />
      </g>
    );
  }

  if (slug === 'klad-skelett') {
    return (
      <g aria-hidden>
        {neck}
        {shoulders('#191622')}
        <path d="M104 178 C112 190 128 190 136 178" stroke="#d9d4e6" strokeWidth="3" fill="none" opacity="0.85" />
        <path d="M120 192 v46" stroke="#e7e3ef" strokeWidth="4" strokeLinecap="round" />
        {[198, 208, 218, 228].map((y, index) => (
          <g key={y}>
            <path
              d={`M${104 - index * 2} ${y} q16 ${index % 2 ? 9 : -9} ${32 + index * 3} 0`}
              stroke="#e7e3ef"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              opacity={0.9 - index * 0.1}
            />
            <path
              d={`M${106 - index * 2} ${y + 2} q15 ${index % 2 ? 7 : -7} ${28 + index * 3} 0`}
              stroke="#8f8ba0"
              strokeWidth="1"
              fill="none"
              opacity={0.5 - index * 0.08}
            />
          </g>
        ))}
        <path d="M90 186 C98 180 108 180 114 184" stroke="#cfcadd" strokeWidth="4" fill="none" opacity="0.7" />
        <path d="M150 186 C142 180 132 180 126 184" stroke="#cfcadd" strokeWidth="4" fill="none" opacity="0.7" />
      </g>
    );
  }

  if (slug === 'klad-kattdrakt') {
    return (
      <g aria-hidden>
        {neck}
        {shoulders('#241f2c')}
        <path d="M94 180 C106 194 134 194 146 180" stroke="#3d3548" strokeWidth="7" fill="none" strokeLinecap="round" />
        <path d="M96 182 C108 193 132 193 144 182" stroke="#4f4560" strokeWidth="2" fill="none" opacity="0.6" />
        <path d="M104 206 q16 -12 32 0" stroke="#3a3247" strokeWidth="3" fill="none" opacity="0.6" />
        <path d="M120 240 v-28" stroke="#3a3247" strokeWidth="2.2" opacity="0.5" />
        {[88, 98, 142, 152].map((x, index) => (
          <path key={x} d={`M${x} ${198 + index * 8} q${index % 2 ? 4 : -4} 8 0 16`} stroke="#4a4058" strokeWidth="1.6" fill="none" opacity="0.4" />
        ))}
        <circle cx="120" cy="190" r="4.6" fill="#f2c14e" opacity="0.22" />
      </g>
    );
  }

  // Standard: natt-hoodien (gäller även okända nycklar).
  return (
    <g aria-hidden>
      {neck}
      {shoulders('#2b2b3a')}
      <path d="M90 176 C98 200 142 200 150 176 C140 164 100 164 90 176 Z" fill="#353545" />
      <path d="M92 178 C100 198 140 198 148 178" stroke="#474759" strokeWidth="2" fill="none" opacity="0.75" />
      <path d="M90 176 C98 200 142 200 150 176 C142 192 98 192 90 176 Z" fill="#20202c" opacity="0.5" />
      <path d="M106 194 v22 M134 194 v22" stroke="#c7c9d6" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
      <circle cx="106" cy="216" r="2.4" fill="#e5e7f0" opacity="0.85" />
      <circle cx="134" cy="216" r="2.4" fill="#e5e7f0" opacity="0.85" />
      <path d="M104 228 h32 v9 h-32 Z" fill="#232331" opacity="0.75" />
      <circle cx="120" cy="232" r="8" fill="#f2c14e" opacity="0.2" />
      <path d="M120 224 a8 8 0 1 1 -0.1 0" fill="none" stroke="#f2c14e" strokeWidth="1.2" opacity="0.45" />
      <path d="M150 180 C176 192 188 214 190 240" stroke="rgba(255,255,255,0.14)" strokeWidth="1.6" fill="none" />
    </g>
  );
};

/* -------------------------------------------------------------------- hår */

function hairBack(slug: string | null, palette: Palette, uid: string): React.ReactNode {
  const fill = `url(#${uid}-hair)`;

  if (slug === 'har-langt' || slug === 'har-lockar') {
    return (
      <g>
        <path
          d="M74 82 C58 112 58 160 48 198 C58 212 80 216 90 202 C80 172 84 128 90 100 Z"
          fill={fill}
        />
        <path
          d="M166 82 C182 112 182 160 192 198 C182 212 160 216 150 202 C160 172 156 128 150 100 Z"
          fill={fill}
        />
        <path d="M58 190 C66 198 80 200 87 194" stroke={palette.hairLight} strokeWidth="1.4" fill="none" opacity="0.4" />
        <path d="M182 190 C174 198 160 200 153 194" stroke={palette.hairLight} strokeWidth="1.4" fill="none" opacity="0.35" />
        {slug === 'har-lockar' && (
          <g fill={fill}>
            <circle cx="58" cy="180" r="16" />
            <circle cx="74" cy="200" r="14" />
            <circle cx="182" cy="180" r="16" />
            <circle cx="166" cy="200" r="14" />
            <path d="M52 172 C56 162 64 158 72 160" stroke={palette.hairLight} strokeWidth="1.6" fill="none" opacity="0.3" />
            <path d="M188 172 C184 162 176 158 168 160" stroke={palette.hairLight} strokeWidth="1.6" fill="none" opacity="0.25" />
          </g>
        )}
      </g>
    );
  }

  if (slug === 'har-bob') {
    return (
      <path
        d="M73 86 C70 118 74 142 84 156 C94 164 106 167 120 167 C134 167 146 164 156 156 C166 142 170 118 167 86 C152 94 138 98 120 98 C102 98 88 94 73 86 Z"
        fill={fill}
      />
    );
  }

  return null;
}

function hairFront(slug: string | null, palette: Palette, uid: string): React.ReactNode {
  const fill = `url(#${uid}-hair)`;
  const strand = (d: string, opacity = 0.4) => (
    <path d={d} stroke={palette.hairLight} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity={opacity} />
  );
  const hairline =
    'M76 102 C72 70 94 40 120 40 C146 40 168 70 164 102 C158 84 148 73 137 69 C131 63 126 60 120 60 C114 60 109 63 103 69 C92 73 82 84 76 102';

  if (slug === 'har-bob') {
    return (
      <g>
        <path d={hairline} fill={fill} />
        <path d="M84 90 C89 69 101 56 118 51" stroke={palette.hairLight} strokeWidth="2" fill="none" opacity="0.4" />
        {strand('M100 64 C108 57 118 54 127 56', 0.3)}
        {strand('M130 58 C140 64 147 72 151 83', 0.24)}
        <path d="M81 96 C79 114 81 132 86 148 C92 152 98 147 97 139 C93 126 91 110 93 97 Z" fill={fill} />
        <path d="M159 96 C161 114 159 132 154 148 C148 152 142 147 143 139 C147 126 149 110 147 97 Z" fill={fill} />
      </g>
    );
  }

  if (slug === 'har-langt') {
    return (
      <g>
        <path d={hairline} fill={fill} />
        <path d="M120 49 C104 53 93 65 88 84 L80 78 C88 58 103 49 120 49 Z" fill={palette.hairLight} opacity="0.16" />
        {strand('M90 76 C98 62 109 54 122 52', 0.4)}
        {strand('M128 52 C141 58 150 71 154 88', 0.28)}
        {strand('M99 62 C108 55 119 52 128 54', 0.24)}
        <path d="M81 96 C77 118 77 142 74 162 C80 170 90 168 92 158 C92 134 92 112 95 98 Z" fill={fill} />
        <path d="M159 96 C163 118 163 142 166 162 C160 170 150 168 148 158 C148 134 148 112 145 98 Z" fill={fill} />
      </g>
    );
  }

  if (slug === 'har-tofs') {
    return (
      <g>
        <circle cx="120" cy="34" r="16" fill={fill} />
        <circle cx="114" cy="31" r="8" fill={palette.hairLight} opacity="0.16" />
        <path d="M108 32 C112 24 122 22 129 28" stroke={palette.hairLight} strokeWidth="1.7" fill="none" opacity="0.4" />
        <path d={hairline} fill={fill} />
        {strand('M94 80 C103 64 114 57 127 57', 0.38)}
        {strand('M131 60 C142 68 149 79 153 92', 0.26)}
        <path d="M81 96 C79 110 80 122 84 131 C89 129 90 121 89 113 C88 106 88 102 90 98 Z" fill={fill} />
        <path d="M159 96 C161 110 160 122 156 131 C151 129 150 121 151 113 C152 106 152 102 150 98 Z" fill={fill} />
      </g>
    );
  }

  if (slug === 'har-lockar') {
    return (
      <g>
        <g fill={fill}>
          <circle cx="90" cy="68" r="17" />
          <circle cx="109" cy="53" r="17" />
          <circle cx="131" cy="53" r="17" />
          <circle cx="150" cy="68" r="17" />
          <circle cx="83" cy="90" r="14" />
          <circle cx="157" cy="90" r="14" />
        </g>
        <path d="M88 62 C94 51 105 44 118 43" stroke={palette.hairLight} strokeWidth="1.8" fill="none" opacity="0.36" />
        <path d="M123 43 C137 45 148 54 153 67" stroke={palette.hairLight} strokeWidth="1.8" fill="none" opacity="0.24" />
        <path d="M97 57 C105 51 113 49 121 49" stroke={palette.hairLight} strokeWidth="1.2" fill="none" opacity="0.2" />
      </g>
    );
  }

  // har-kort och okända nycklar
  return (
    <g>
      <path d={hairline} fill={fill} />
      <path d="M84 92 C88 71 101 57 118 51" stroke={palette.hairLight} strokeWidth="2" fill="none" opacity="0.4" />
      {strand('M98 65 C106 57 115 54 124 55', 0.3)}
      {strand('M128 57 C138 62 145 71 149 82', 0.22)}
      <path d="M81 96 C79 105 80 114 83 121 C87 119 88 111 87 103 C85 100 83 98 81 96 Z" fill={fill} />
      <path d="M159 96 C161 105 160 114 157 121 C153 119 152 111 153 103 C155 100 157 98 159 96 Z" fill={fill} />
    </g>
  );
}

/* ----------------------------------------------------------------- ansikte */

const Face: React.FC<{ palette: Palette; eyeSlug: string | null; uid: string }> = ({
  palette,
  eyeSlug,
  uid,
}) => {
  const skinFill = `url(#${uid}-skin)`;
  const line = palette.skinLine;
  const lash = shade(palette.hair, 0.22);

  const eye = (cx: number) => {
    const w = 8.8;
    const iris = 4.3;
    const shape = `M${cx - w} 96.5 C${cx - w + 3.4} 90.6 ${cx + w - 3.4} 90.6 ${cx + w} 96.5 C${cx + w - 3.6} 102.4 ${cx - w + 3.6} 102.4 ${cx - w} 96.5 Z`;
    const upper = `M${cx - w} 96.5 C${cx - w + 3.4} 90.6 ${cx + w - 3.4} 90.6 ${cx + w} 96.5`;

    const shell = (
      <>
        <path d={shape} fill="#f6f1e6" />
        <path
          d={`M${cx - w} 96.5 C${cx - w + 3} 98.8 ${cx - w + 5.4} 99.8 ${cx} 99.8`}
          fill={shade(palette.skin, 0.3)}
          opacity="0.18"
        />
      </>
    );

    if (eyeSlug === 'oga-glow') {
      return (
        <g key={cx}>
          <ellipse cx={cx} cy="96.5" rx="11" ry="7" fill={palette.eye} opacity="0.14" />
          {shell}
          <circle cx={cx} cy="96.5" r={iris} fill={`url(#${uid}-eye)`} />
          <circle cx={cx} cy="96.5" r={iris} fill="none" stroke={shade(palette.eye, 0.6)} strokeWidth="0.7" opacity="0.55" />
          <circle cx={cx} cy="96.5" r="2" fill="#171320" />
          <circle cx={cx - 1.5} cy="95" r="1.3" fill="#ffffff" opacity="0.95" />
          <circle cx={cx + 1.7} cy="98" r="0.7" fill="#ffffff" opacity="0.5" />
          <path d={upper} stroke={lash} strokeWidth="1.7" fill="none" strokeLinecap="round" />
          <path
            d={`M${cx - 7.6} 91.4 C${cx - 4} 89.4 ${cx + 3} 89.2 ${cx + 7.4} 91.2`}
            stroke="#ffffff"
            strokeWidth="0.8"
            fill="none"
            opacity="0.3"
          />
          <path
            d={`M${cx - 8} 101.4 C${cx - 4} 103.6 ${cx + 4} 103.6 ${cx + 8} 101.4`}
            stroke={line}
            strokeWidth="1"
            fill="none"
            opacity="0.35"
          />
        </g>
      );
    }

    if (eyeSlug === 'oga-katt') {
      return (
        <g key={cx}>
          {shell}
          <circle cx={cx} cy="96.5" r={iris + 0.5} fill={palette.eye} />
          <circle cx={cx} cy="96.5" r={iris + 0.5} fill="none" stroke={shade(palette.eye, 0.5)} strokeWidth="0.9" />
          <ellipse cx={cx} cy="96.5" rx="1.4" ry="4.1" fill="#100e18" />
          <circle cx={cx - 1.8} cy="94.8" r="1.3" fill="#ffffff" opacity="0.9" />
          <path d={upper} stroke={lash} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path
            d={`M${cx - 8.2} 91.2 L${cx - 11.6} 88.6`}
            stroke={lash}
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>
      );
    }

    return (
      <g key={cx}>
        {shell}
        <circle cx={cx} cy="96.5" r={iris} fill={`url(#${uid}-eye)`} />
        <circle cx={cx} cy="96.5" r={iris} fill="none" stroke={shade(palette.eye, 0.55)} strokeWidth="0.7" opacity="0.7" />
        <circle cx={cx} cy="96.5" r="1.9" fill="#171320" />
        <circle cx={cx - 1.4} cy="95" r="1.3" fill="#ffffff" opacity="0.95" />
        <circle cx={cx + 1.6} cy="98.1" r="0.6" fill="#ffffff" opacity="0.5" />
        <path d={upper} stroke={lash} strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.9" />
        <path
          d={`M${cx - 7.4} 91.6 C${cx - 4} 89.6 ${cx + 3} 89.4 ${cx + 7.2} 91.4`}
          stroke="#ffffff"
          strokeWidth="0.8"
          fill="none"
          opacity="0.28"
        />
        <path
          d={`M${cx - 8} 101.4 C${cx - 4} 103.6 ${cx + 4} 103.6 ${cx + 8} 101.4`}
          stroke={line}
          strokeWidth="1"
          fill="none"
          opacity="0.32"
        />
        <path
          d={`M${cx + 7} 92.4 L${cx + 10.2} 90.4`}
          stroke={lash}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>
    );
  };

  return (
    <g aria-hidden>
      {/* öron, delvis dolda bakom kindbenen */}
      <g>
        <path d="M85 86 C80 80 74 83 75 95 C76 105 81 111 86 107 Z" fill={skinFill} />
        <path d="M86 108 C82 104 79 98 79 91 C79 86 81 83 84 83" stroke={line} strokeWidth="1.1" fill="none" opacity="0.45" />
        <ellipse cx="81" cy="96" rx="2.3" ry="4.8" fill={shade(palette.skin, 0.4)} opacity="0.38" />
        <path d="M82.5 90 C84.2 93 84.2 100 82.5 103" stroke={lighten(palette.skin, 0.35)} strokeWidth="1.1" fill="none" opacity="0.4" />
        <path d="M155 86 C160 80 166 83 165 95 C164 105 159 111 154 107 Z" fill={skinFill} />
        <path d="M154 108 C158 104 161 98 161 91 C161 86 159 83 156 83" stroke={line} strokeWidth="1.1" fill="none" opacity="0.4" />
        <ellipse cx="159" cy="96" rx="2.3" ry="4.8" fill={shade(palette.skin, 0.4)} opacity="0.34" />
        <path d="M157.5 90 C155.8 93 155.8 100 157.5 103" stroke={lighten(palette.skin, 0.35)} strokeWidth="1.1" fill="none" opacity="0.35" />
      </g>

      {/* huvudform */}
      <path
        d="M120 47 C142 47 158.6 64 159.4 88 C160 104 156 118 147.4 131 C140.4 141.4 131.4 147.6 120 147.6 C108.6 147.6 99.6 141.4 92.6 131 C84 118 80 104 80.6 88 C81.4 64 98 47 120 47 Z"
        fill={skinFill}
      />
      <path
        d="M120 47 C142 47 158.6 64 159.4 88 C159.8 100 157 112 151 122 C154 108 154 94 151.6 82 C147 61 136 49 120 47 Z"
        fill={shade(palette.skin, 0.32)}
        opacity="0.24"
      />

      {/* ljus och skugga över panna, tinningar och kinder */}
      <ellipse cx="116" cy="70" rx="26" ry="13" fill={lighten(palette.skin, 0.42)} opacity="0.24" />
      <ellipse cx="88" cy="84" rx="6.5" ry="15" fill={shade(palette.skin, 0.32)} opacity="0.16" />
      <ellipse cx="152" cy="84" rx="6.5" ry="15" fill={shade(palette.skin, 0.32)} opacity="0.13" />
      <ellipse cx="99" cy="107" rx="12" ry="9" fill={lighten(palette.skin, 0.26)} opacity="0.14" />
      <ellipse cx="141" cy="107" rx="12" ry="9" fill={lighten(palette.skin, 0.26)} opacity="0.1" />
      <ellipse cx="98" cy="110" rx="9.5" ry="6" fill="#c76b52" opacity="0.1" />
      <ellipse cx="142" cy="110" rx="9.5" ry="6" fill="#c76b52" opacity="0.08" />
      <path d="M153 72 C159 86 159.6 104 154 120" stroke={lighten(palette.skin, 0.46)} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.38" />
      <path d="M96 59 C105 53 114 51 121 51" stroke={lighten(palette.skin, 0.36)} strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.28" />

      {/* näsa */}
      <path
        d="M118.6 97 C116 103 113.6 108 113.4 111.6 C114.4 114 118 115 120 115 C122.4 115 125.6 114 126.6 111.6 C126.4 108 123.8 103 121.2 97 Z"
        fill={shade(palette.skin, 0.22)}
        opacity="0.42"
      />
      <path d="M116.6 99 C115.2 104 114.4 108 114.6 111" stroke={lighten(palette.skin, 0.4)} strokeWidth="1.4" fill="none" opacity="0.4" />
      <ellipse cx="120" cy="111.4" rx="5.6" ry="3.4" fill={lighten(palette.skin, 0.5)} opacity="0.35" />
      <ellipse cx="114.6" cy="112.4" rx="1.6" ry="1.1" fill={shade(palette.skin, 0.58)} opacity="0.45" />
      <ellipse cx="125.4" cy="112.4" rx="1.6" ry="1.1" fill={shade(palette.skin, 0.58)} opacity="0.45" />
      <path
        d="M114.4 111.4 C116 113.4 124 113.4 125.6 111.4"
        stroke={shade(palette.skin, 0.42)}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <ellipse cx="120" cy="119.6" rx="6" ry="2.2" fill={shade(palette.skin, 0.26)} opacity="0.14" />

      {/* mun */}
      <path
        d="M110.4 126.6 C113 124.8 115.6 125.4 120 126.2 C124.4 125.4 127 124.8 129.6 126.6 C126.6 131 113.4 131 110.4 126.6 Z"
        fill="#b05a4e"
        opacity="0.34"
      />
      <path
        d="M110.4 126.6 C114 125.2 117 125.2 120 125.8 C123 125.2 126 125.2 129.6 126.6"
        stroke={shade(palette.skin, 0.55)}
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M112.6 127.6 C116.4 126.6 123.6 126.6 127.4 127.6 C123.6 129.6 116.4 129.6 112.6 127.6 Z"
        fill={lighten(palette.skin, 0.55)}
        opacity="0.35"
      />
      <path d="M114.4 133.6 C118 135 122 135 125.6 133.6" stroke={shade(palette.skin, 0.22)} strokeWidth="1.2" fill="none" opacity="0.26" />

      {/* ögonbryn */}
      <path
        d="M94 84.6 C100 80.8 108.4 81.2 114.2 84.2"
        stroke={shade(palette.hair, 0.2)}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.92"
      />
      <path
        d="M146 84.6 C140 80.8 131.6 81.2 125.8 84.2"
        stroke={shade(palette.hair, 0.2)}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.92"
      />
      <path
        d="M95.6 83.6 C101 80.8 107.4 81 112.4 83.2"
        stroke={lighten(palette.hair, 0.3)}
        strokeWidth="0.8"
        fill="none"
        opacity="0.28"
      />
      <path
        d="M144.4 83.6 C139 80.8 132.6 81 127.6 83.2"
        stroke={lighten(palette.hair, 0.3)}
        strokeWidth="0.8"
        fill="none"
        opacity="0.26"
      />

      <ellipse cx="104" cy="104" rx="10.4" ry="3.8" fill={shade(palette.skin, 0.3)} opacity="0.13" />
      <ellipse cx="136" cy="104" rx="10.4" ry="3.8" fill={shade(palette.skin, 0.3)} opacity="0.13" />

      {eye(104)}
      {eye(136)}

      <ellipse cx="120" cy="141" rx="8" ry="4.4" fill={lighten(palette.skin, 0.35)} opacity="0.2" />
      <path
        d="M95 126 C102 138 111 144 120 144 C129 144 138 138 145 126"
        stroke={shade(palette.skin, 0.26)}
        strokeWidth="1.5"
        fill="none"
        opacity="0.16"
      />
    </g>
  );
};

/* ------------------------------------------------------------- huvudbonad */

const Headwear: React.FC<{ slug: string | null; uid: string }> = ({ slug, uid }) => {
  if (!slug) return null;

  switch (slug) {
    case 'hatt-pumpa':
      return (
        <g aria-hidden>
          <defs>
            <radialGradient id={`${uid}-pumpa`} cx="36%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#f6a552" />
              <stop offset="55%" stopColor="#d9772a" />
              <stop offset="100%" stopColor="#8f4413" />
            </radialGradient>
            <radialGradient id={`${uid}-pumpa-glod`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffcf7a" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#ffcf7a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="120" cy="62" rx="54" ry="36" fill={`url(#${uid}-pumpa-glod)`} />
          <g>
            <ellipse cx="120" cy="54" rx="45" ry="29" fill={`url(#${uid}-pumpa)`} />
            <path d="M120 25 C111 36 111 74 120 83 C129 74 129 36 120 25 Z" fill="#b85e1c" opacity="0.5" />
            <path d="M120 26 C102 32 88 46 86 58 C94 50 108 40 120 36 Z" fill="#f7b066" opacity="0.32" />
            <path d="M120 26 C138 32 152 46 154 58 C146 50 132 40 120 36 Z" fill="#7d3a0f" opacity="0.32" />
            <path d="M96 50 C98 40 106 32 116 29" stroke="#ffc37a" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.5" />
            <path d="M120 25 C118 17 121 10 127 6" stroke="#4f6b32" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M127 7 C136 2 146 6 148 13 C139 17 130 15 127 7 Z" fill="#5d7d3a" />
            <path d="M133 10 C139 10 144 12 146 14" stroke="#89a95c" strokeWidth="1.4" fill="none" opacity="0.7" />
            <ellipse cx="101" cy="43" rx="10" ry="6" fill="#ffd08a" opacity="0.26" />
          </g>
        </g>
      );
    case 'hatt-spokhuva':
      return (
        <g aria-hidden>
          <defs>
            <linearGradient id={`${uid}-huva`} x1="0.1" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
              <stop offset="55%" stopColor="#e2dfec" stopOpacity="0.94" />
              <stop offset="100%" stopColor="#a9a2bd" stopOpacity="0.9" />
            </linearGradient>
            <radialGradient id={`${uid}-huva-skugga`} cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#161020" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#161020" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M120 20 C154 20 176 44 180 82 C182 106 172 130 158 148 C150 138 148 124 150 112 C144 122 132 132 120 134 C108 132 96 122 90 112 C92 124 90 138 82 148 C68 130 58 106 60 82 C64 44 86 20 120 20 Z"
            fill={`url(#${uid}-huva)`}
          />
          <path d="M120 26 C100 32 84 50 78 76 C90 58 104 44 120 38 Z" fill="#ffffff" opacity="0.5" />
          <path d="M96 130 C104 140 112 146 120 148 C128 146 136 140 144 130 C134 136 126 139 120 139 C114 139 106 136 96 130 Z" fill="#8f88a8" opacity="0.5" />
          <ellipse cx="120" cy="82" rx="36" ry="34" fill={`url(#${uid}-huva-skugga)`} />
          <path d="M82 148 C74 154 72 162 78 166 C84 160 90 154 92 150 Z" fill="#d8d4e6" opacity="0.85" />
          <path d="M158 148 C166 154 168 162 162 166 C156 160 150 154 148 150 Z" fill="#c6c0d8" opacity="0.8" />
        </g>
      );
    case 'hatt-hax':
      return (
        <g aria-hidden>
          <defs>
            <linearGradient id={`${uid}-haxhatt`} x1="0.2" y1="0" x2="0.85" y2="1">
              <stop offset="0%" stopColor="#4a3a5e" />
              <stop offset="50%" stopColor="#2e2540" />
              <stop offset="100%" stopColor="#191328" />
            </linearGradient>
            <linearGradient id={`${uid}-haxband`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b3150" />
              <stop offset="100%" stopColor="#1a1428" />
            </linearGradient>
          </defs>
          <ellipse cx="122" cy="66" rx="66" ry="15" fill="#0c0914" opacity="0.45" />
          <path d="M60 64 C78 52 162 52 180 64 C162 74 78 74 60 64 Z" fill={`url(#${uid}-haxband)`} />
          <path d="M64 63 C82 55 158 55 176 63" stroke="#8c7ba8" strokeWidth="1.4" fill="none" opacity="0.45" />
          <path d="M88 60 C92 38 106 20 130 10 C138 8 142 12 138 20 C126 38 122 52 126 60 Z" fill={`url(#${uid}-haxhatt)`} />
          <path d="M96 56 C98 40 108 26 124 16" stroke="#7d6a9c" strokeWidth="2" fill="none" opacity="0.35" />
          <path d="M88 58 C96 54 118 54 126 58 L126 64 C116 68 98 68 88 64 Z" fill={`url(#${uid}-haxband)`} />
          <rect x="100" y="54" width="13" height="12" rx="2" fill="#c9a227" transform="rotate(-4 106 60)" />
          <rect x="103" y="57" width="7" height="6" rx="1" fill="#2a2136" />
          <path d="M92 61 C100 58 116 58 124 61" stroke="#b9a75a" strokeWidth="1.2" fill="none" opacity="0.5" />
          <path d="M138 20 C146 22 152 28 150 36 C146 30 140 26 136 28 Z" fill="#241c34" opacity="0.6" />
        </g>
      );
    case 'hatt-horn':
      return (
        <g aria-hidden>
          <defs>
            <linearGradient id={`${uid}-horn`} x1="0" y1="1" x2="0.4" y2="0">
              <stop offset="0%" stopColor="#2a1f2b" />
              <stop offset="55%" stopColor="#5b4a55" />
              <stop offset="100%" stopColor="#d9cbb6" />
            </linearGradient>
          </defs>
          <path d="M92 70 C80 60 72 44 76 26 C84 34 92 42 98 48 C100 58 98 66 92 70 Z" fill={`url(#${uid}-horn)`} />
          <path d="M148 70 C160 60 168 44 164 26 C156 34 148 42 142 48 C140 58 142 66 148 70 Z" fill={`url(#${uid}-horn)`} />
          <path d="M77 30 C84 40 90 48 95 54" stroke="#f0e6d2" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M163 30 C156 40 150 48 145 54" stroke="#f0e6d2" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
          <path d="M78 32 C74 24 76 18 80 14" stroke="#8d7a6a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M162 32 C166 24 164 18 160 14" stroke="#8d7a6a" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M78 68 C88 62 104 60 120 60 C136 60 152 62 162 68 C150 74 136 77 120 77 C104 77 90 74 78 68 Z" fill="#241a28" opacity="0.85" />
          <path d="M86 68 C98 64 110 63 120 63 C130 63 142 64 154 68" stroke="#5d4a60" strokeWidth="1.4" fill="none" opacity="0.7" />
        </g>
      );
    case 'hatt-krona':
      return (
        <g aria-hidden>
          <defs>
            <linearGradient id={`${uid}-krona`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0e6c8" />
              <stop offset="45%" stopColor="#b9a86a" />
              <stop offset="100%" stopColor="#7d6a3a" />
            </linearGradient>
            <linearGradient id={`${uid}-kronband`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2c2440" />
              <stop offset="100%" stopColor="#171226" />
            </linearGradient>
          </defs>
          <ellipse cx="120" cy="66" rx="46" ry="12" fill="#0b0812" opacity="0.4" />
          <path d="M78 62 L84 34 L100 50 L120 26 L140 50 L156 34 L162 62 Z" fill={`url(#${uid}-krona)`} />
          <path d="M84 34 L92 44 L100 50 L108 40 L120 26 L121 26 L120 42 L110 56 L90 58 Z" fill="#fff6d8" opacity="0.25" />
          <path d="M78 62 C94 56 146 56 162 62 L162 70 C146 76 94 76 78 70 Z" fill={`url(#${uid}-kronband)`} />
          <path d="M80 64 C96 59 144 59 160 64" stroke="#e8d69a" strokeWidth="1.6" fill="none" opacity="0.55" />
          <circle cx="120" cy="66" r="5" fill="#b8324a" />
          <circle cx="120" cy="66" r="5" fill="none" stroke="#f6dfa8" strokeWidth="1" />
          <circle cx="118" cy="64" r="1.6" fill="#ff92a6" opacity="0.9" />
          <circle cx="96" cy="68" r="3.4" fill="#3f6fb8" />
          <circle cx="144" cy="68" r="3.4" fill="#3f6fb8" />
          <circle cx="120" cy="30" r="3.2" fill="#fff6d8" />
          <circle cx="84" cy="36" r="2.4" fill="#fff6d8" opacity="0.9" />
          <circle cx="156" cy="36" r="2.4" fill="#fff6d8" opacity="0.9" />
        </g>
      );
    default:
      return null;
  }
};

/* -------------------------------------------------------------------- mask */

const Mask: React.FC<{ slug: string | null; uid: string }> = ({ slug, uid }) => {
  if (!slug) return null;

  switch (slug) {
    case 'mask-pumpa':
      return (
        <g aria-hidden>
          <defs>
            <radialGradient id={`${uid}-maskpumpa`} cx="38%" cy="30%" r="76%">
              <stop offset="0%" stopColor="#f2a050" />
              <stop offset="60%" stopColor="#cf6f24" />
              <stop offset="100%" stopColor="#8a3f10" />
            </radialGradient>
            <radialGradient id={`${uid}-maskglod`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffd58a" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#ffd58a" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path d="M120 54 C150 54 168 72 168 100 C168 128 148 152 120 156 C92 152 72 128 72 100 C72 72 90 54 120 54 Z" fill={`url(#${uid}-maskpumpa)`} />
          <path d="M120 56 C104 62 92 78 88 94" stroke="#ffca8a" strokeWidth="2.4" fill="none" opacity="0.35" />
          <path d="M120 56 C136 62 148 78 152 94" stroke="#6d2e0a" strokeWidth="2" fill="none" opacity="0.35" />
          <path d="M120 56 C112 66 108 84 108 100 C108 118 112 138 120 150 C128 138 132 118 132 100 C132 84 128 66 120 56 Z" fill="#a94f16" opacity="0.35" />
          <path d="M92 90 L108 100 L92 108 Z" fill="#241206" />
          <path d="M148 90 L132 100 L148 108 Z" fill="#241206" />
          <ellipse cx="100" cy="99" rx="14" ry="12" fill={`url(#${uid}-maskglod)`} />
          <ellipse cx="140" cy="99" rx="14" ry="12" fill={`url(#${uid}-maskglod)`} />
          <path d="M96 130 C104 122 112 126 120 132 C128 126 136 122 144 130 C138 140 128 144 120 142 C112 144 102 140 96 130 Z" fill="#241206" />
          <path d="M100 130 L108 126 L108 134 Z M140 130 L132 126 L132 134 Z" fill="#f4d9a2" />
          <path d="M120 52 C118 44 120 38 126 34" stroke="#4f6b32" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'mask-spoke':
      return (
        <g aria-hidden>
          <defs>
            <linearGradient id={`${uid}-maskspoke`} x1="0.2" y1="0" x2="0.8" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#e7e3ef" />
              <stop offset="100%" stopColor="#b3abc6" />
            </linearGradient>
            <radialGradient id={`${uid}-maskhala`} cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#0d0a14" />
              <stop offset="100%" stopColor="#241d33" />
            </radialGradient>
          </defs>
          <path d="M120 52 C148 52 166 70 166 100 C166 130 148 154 120 158 C92 154 74 130 74 100 C74 70 92 52 120 52 Z" fill={`url(#${uid}-maskspoke)`} />
          <path d="M86 120 C94 144 106 154 120 158 C134 154 146 144 154 120 C146 140 134 150 120 152 C106 150 94 140 86 120 Z" fill="#9d95b2" opacity="0.45" />
          <ellipse cx="101" cy="98" rx="13" ry="16" fill={`url(#${uid}-maskhala)`} />
          <ellipse cx="139" cy="98" rx="13" ry="16" fill={`url(#${uid}-maskhala)`} />
          <ellipse cx="101" cy="103" rx="5" ry="3" fill="#4b4166" opacity="0.5" />
          <ellipse cx="139" cy="103" rx="5" ry="3" fill="#4b4166" opacity="0.5" />
          <path d="M112 126 C116 132 124 132 128 126 C124 138 116 138 112 126 Z" fill={`url(#${uid}-maskhala)`} />
          <path d="M92 80 C100 74 110 72 118 74" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.55" />
        </g>
      );
    case 'mask-skalle':
      return (
        <g aria-hidden>
          <defs>
            <radialGradient id={`${uid}-skalle`} cx="38%" cy="26%" r="78%">
              <stop offset="0%" stopColor="#fbf7ea" />
              <stop offset="55%" stopColor="#e3ddc9" />
              <stop offset="100%" stopColor="#b0a892" />
            </radialGradient>
            <radialGradient id={`${uid}-skallehal`} cx="50%" cy="45%" r="60%">
              <stop offset="0%" stopColor="#0c0a10" />
              <stop offset="100%" stopColor="#2a2431" />
            </radialGradient>
          </defs>
          <path d="M120 52 C150 52 167 70 167 98 C167 118 158 132 146 142 C142 148 140 154 136 156 L104 156 C100 154 98 148 94 142 C82 132 73 118 73 98 C73 70 90 52 120 52 Z" fill={`url(#${uid}-skalle)`} />
          <path d="M84 112 C92 134 106 146 120 148 C134 146 148 134 156 112 C150 136 136 150 120 152 C104 150 90 136 84 112 Z" fill="#a49b84" opacity="0.4" />
          <ellipse cx="101" cy="97" rx="14" ry="15" fill={`url(#${uid}-skallehal)`} />
          <ellipse cx="139" cy="97" rx="14" ry="15" fill={`url(#${uid}-skallehal)`} />
          <path d="M120 108 L114 122 L126 122 Z" fill={`url(#${uid}-skallehal)`} />
          <path d="M104 132 C112 128 128 128 136 132 L136 142 C128 138 112 138 104 142 Z" fill="#c9c1a9" />
          <path d="M104 136 h32 M104 141 h32" stroke="#8f8772" strokeWidth="1.2" />
          {[110, 118, 126, 134].map((x) => (
            <path key={x} d={`M${x} 132 v10`} stroke="#9d947c" strokeWidth="1.1" opacity="0.8" />
          ))}
          <path d="M92 78 C102 72 112 71 120 72" stroke="#fffdf4" strokeWidth="2" fill="none" opacity="0.6" />
          <path d="M157 86 C162 96 162 110 157 122" stroke="#fffdf4" strokeWidth="2" fill="none" opacity="0.3" />
        </g>
      );
    default:
      return null;
  }
};

/* --------------------------------------------------------------- glasögon */

const Glasses: React.FC<{ slug: string | null; uid: string }> = ({ slug, uid }) => {
  if (!slug) return null;

  const lens = (cx: number, r: number) => (
    <g key={cx}>
      <circle cx={cx} cy="100" r={r} fill={`url(#${uid}-lens)`} opacity="0.55" />
      <circle cx={cx} cy="100" r={r} fill="none" stroke={shade('#d9c48a', 0.35)} strokeWidth="0.9" opacity="0.6" />
      <path
        d={`M${cx - r * 0.6} ${100 - r * 0.55} L${cx - r * 0.15} ${100 - r * 0.85}`}
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.45"
      />
    </g>
  );

  if (slug === 'glas-runda') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-lens`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d8ecff" />
            <stop offset="100%" stopColor="#8fb4d8" />
          </linearGradient>
        </defs>
        <g fill="none" stroke="#2b2433" strokeWidth="2.2">
          <circle cx="102" cy="100" r="12.5" />
          <circle cx="138" cy="100" r="12.5" />
          <path d="M114.5 100 h11" />
          <path d="M89.5 100 h-11 M150.5 100 h11" />
        </g>
        {lens(102, 12.5)}
        {lens(138, 12.5)}
        <circle cx="114.5" cy="100" r="1.8" fill="#d9c48a" />
        <circle cx="125.5" cy="100" r="1.8" fill="#d9c48a" />
      </g>
    );
  }

  if (slug === 'glas-monokel') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-lens`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e8f3ff" />
            <stop offset="100%" stopColor="#a9c6e0" />
          </linearGradient>
          <linearGradient id={`${uid}-guld`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f4e2a8" />
            <stop offset="50%" stopColor="#c9a85a" />
            <stop offset="100%" stopColor="#8a6f32" />
          </linearGradient>
        </defs>
        <circle cx="138" cy="100" r="14" fill="none" stroke={`url(#${uid}-guld)`} strokeWidth="2.4" />
        {lens(138, 13.4)}
        <path d="M151 106 C160 118 168 132 172 148" stroke={`url(#${uid}-guld)`} strokeWidth="1.6" fill="none" />
        <circle cx="172" cy="149" r="2.6" fill="#c9a85a" />
      </g>
    );
  }

  if (slug === 'glas-stjarnform') {
    return (
      <g aria-hidden>
        <defs>
          <linearGradient id={`${uid}-lens`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffe9c4" />
            <stop offset="100%" stopColor="#d9a45e" />
          </linearGradient>
        </defs>
        {[102, 138].map((cx) => (
          <path
            key={cx}
            d={`M${cx} 88 l4.6 8.4 l9.4 1.4 l-6.8 6.6 l1.6 9.4 l-8.8 -4.6 l-8.8 4.6 l1.6 -9.4 l-6.8 -6.6 l9.4 -1.4 Z`}
            fill={`url(#${uid}-lens)`}
            opacity="0.55"
            stroke="#241d2b"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
        <path d="M114 96 h12" stroke="#241d2b" strokeWidth="2.4" />
        <path d="M89 94 l-9 -6 M151 94 l9 -6" stroke="#241d2b" strokeWidth="2" />
      </g>
    );
  }

  return null;
};

/* ------------------------------------------------------------------ avataren */

export interface AvatarArtProps {
  look: Record<string, string>;
  parts: readonly HalloweenPart[];
  /** Beskrivning för skärmläsare. */
  label?: string;
  className?: string;
  /** Sant när effekter ska ritas (stängs av i små listminiatyrer). */
  effects?: boolean;
}

export const AvatarArt: React.FC<AvatarArtProps> = ({
  look,
  parts,
  label = 'Din Halloween-avatar',
  className,
  effects = true,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const palette = paletteFor(parts, look);
  const background = partOf(parts, look, 'bakgrund');
  const effect = partOf(parts, look, 'effekt');
  const pet = partOf(parts, look, 'husdjur');
  const clothes = partOf(parts, look, 'klader');
  const hair = partOf(parts, look, 'frisyr');
  const eyes = partOf(parts, look, 'ogon');
  const hat = partOf(parts, look, 'huvudbonad');
  const mask = partOf(parts, look, 'mask');
  const glasses = partOf(parts, look, 'glasogon');

  return (
    <svg
      viewBox="0 0 240 240"
      className={`avatar-art ${className ?? ''}`.trim()}
      role="img"
      aria-label={label}
    >
      <defs>
        <radialGradient id={`${uid}-skin`} cx="36%" cy="26%" r="82%">
          <stop offset="0%" stopColor={lighten(palette.skin, 0.22)} />
          <stop offset="52%" stopColor={palette.skin} />
          <stop offset="100%" stopColor={shade(palette.skin, 0.34)} />
        </radialGradient>
        <linearGradient id={`${uid}-hair`} x1="0.25" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={lighten(palette.hair, 0.32)} />
          <stop offset="30%" stopColor={palette.hair} />
          <stop offset="78%" stopColor={shade(palette.hair, 0.38)} />
          <stop offset="100%" stopColor={shade(palette.hair, 0.58)} />
        </linearGradient>
        <radialGradient id={`${uid}-eye`} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor={lighten(palette.eye, 0.35)} />
          <stop offset="55%" stopColor={palette.eye} />
          <stop offset="100%" stopColor={shade(palette.eye, 0.55)} />
        </radialGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="42%" r="72%">
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
        </radialGradient>
      </defs>

      <Scene slug={background?.slug ?? null} uid={uid} />
      {!background && <rect width="240" height="240" fill="#15121f" />}
      {effects && <Effects slug={effect?.slug ?? null} behind />}

      {/* Markens skugga förankrar figuren i scenen. */}
      <ellipse cx="120" cy="232" rx="74" ry="12" fill="#000000" opacity="0.35" />

      {hairBack(hair?.slug ?? null, palette, uid)}
      <Clothes slug={clothes?.slug ?? null} palette={palette} />
      {/* Husdjuret sitter framför axeln, inte bakom den. */}
      <Pet slug={pet?.slug ?? null} uid={uid} />
      <Face palette={palette} eyeSlug={eyes?.slug ?? null} uid={uid} />
      {hair && (
        <path
          d="M76 94 C84 68 100 55 120 55 C140 55 156 68 164 94 C152 80 138 73 120 73 C102 73 88 80 76 94 Z"
          fill="#000000"
          opacity="0.14"
        />
      )}
      {hairFront(hair?.slug ?? null, palette, uid)}
      <Headwear slug={hat?.slug ?? null} uid={uid} />
      <Mask slug={mask?.slug ?? null} uid={uid} />
      <Glasses slug={glasses?.slug ?? null} uid={uid} />
      {effects && <Effects slug={effect?.slug ?? null} />}
      <rect width="240" height="240" fill={`url(#${uid}-vignette)`} pointerEvents="none" />
    </svg>
  );
};

export default AvatarArt;
