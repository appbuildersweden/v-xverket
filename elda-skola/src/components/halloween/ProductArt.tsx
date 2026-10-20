import React from 'react';
import { Moon, Sparkles } from 'lucide-react';
import AvatarArt from './AvatarArt';
import { DEFAULT_LOOK, THEME_META, isRarity, type AvatarSlot } from '../../lib/halloween-catalog';
import type { HalloweenPart } from '../../lib/halloween';

/**
 * Bilder till Halloween-föremålen.
 *
 * Shopens produkter har redan en `asset_key` som pekar på ikonarket som ligger
 * i `public/halloween/ikoner` (samma ikoner som Eldas övriga Halloween-innehåll
 * använder). Avatar-delar ritas i stället som en liten förhandsvisning av
 * avataren, och dekorationerna har egna former för rummet. Allt respekterar
 * appens bas-sökväg, så det fungerar under `/skola/`.
 */

const ICON_BASE = `${import.meta.env.BASE_URL}halloween/ikoner/`;

export function iconUrl(assetKey: string | null | undefined): string | null {
  if (!assetKey || !/^ikon-[a-z0-9-]+$/.test(assetKey)) return null;
  return `${ICON_BASE}${assetKey}.png`;
}

export const ProductArt: React.FC<{
  assetKey?: string | null;
  themeKey?: string | null;
  rarity?: string | null;
  size?: number;
  name?: string;
}> = ({ assetKey, themeKey, rarity, size = 72, name }) => {
  const theme = themeKey ? THEME_META[themeKey] : null;

  if (theme) {
    return (
      <span
        className="halloween-art halloween-art-theme"
        style={{ width: size, height: size, background: theme.swatches[0] }}
        aria-hidden
      >
        <span style={{ background: theme.swatches[1] }} />
        <span style={{ background: theme.swatches[2] }} />
      </span>
    );
  }

  const src = iconUrl(assetKey);
  return (
    <span
      className={`halloween-art ${isRarity(rarity) ? `rarity-${rarity}` : ''}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" width={size * 0.72} height={size * 0.72} loading="lazy" />
      ) : (
        <span className="halloween-art-fallback">
          <Moon size={size * 0.4} />
          <Sparkles size={size * 0.22} />
        </span>
      )}
      {name && <span className="sr-only">{name}</span>}
    </span>
  );
};

/** Färgprov för palettdelar (hudton, hårfärg, ögonfärg). */
export const ColorSwatch: React.FC<{ color: string; size?: number; label?: string }> = ({
  color,
  size = 40,
  label,
}) => (
  <span
    className="halloween-swatch"
    style={{ width: size, height: size, background: color }}
    aria-hidden
    title={label}
  />
);

/**
 * Miniatyr för en avatar-del. Delar i en karaktärsplats ritas på en liten
 * avatar med standardvalen, så att eleven ser hur delen ser ut tillsammans med
 * resten – inte bara som en lös form.
 */
export const PartThumb: React.FC<{
  part: HalloweenPart;
  parts: readonly HalloweenPart[];
  size?: number;
}> = ({ part, parts, size = 84 }) => {
  if (part.kind === 'farg' && part.color) {
    return <ColorSwatch color={part.color} size={size * 0.62} label={part.name} />;
  }

  if (part.slot === 'dekoration') {
    return (
      <span className="halloween-art" style={{ width: size, height: size }} aria-hidden>
        <DecorArt slug={part.slug} size={size * 0.8} />
      </span>
    );
  }

  const look = { ...DEFAULT_LOOK, [part.slot]: part.slug } as Record<string, string>;
  return (
    <span className="halloween-part-thumb" style={{ width: size, height: size }} aria-hidden>
      <AvatarArt
        look={look}
        parts={parts}
        effects={part.slot !== 'bakgrund'}
        label=""
        className="avatar-art-mini"
      />
    </span>
  );
};

/* -------------------------------------------------------------- dekoration */

const DECOR_COLORS: Record<string, { body: string; glow: string }> = {
  'dekor-pumpalykta': { body: '#d97a2c', glow: '#ffcf7a' },
  'dekor-gravsten': { body: '#54615f', glow: '#8fa39f' },
  'dekor-spoke': { body: '#e7e4ef', glow: '#c9c3d8' },
  'dekor-lykta': { body: '#3a3324', glow: '#f2c46a' },
  'dekor-kittel': { body: '#2a2119', glow: '#7fc06f' },
  'dekor-manlykta': { body: '#2c3550', glow: '#b9d6ff' },
};

/** Dekorationerna som ritas i rummet, samlingen och shopen. */
export const DecorArt: React.FC<{ slug: string; size?: number }> = ({ slug, size = 64 }) => {
  const palette = DECOR_COLORS[slug] ?? { body: '#4b3f57', glow: '#c9b06a' };
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');

  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="decor-art">
      <defs>
        <radialGradient id={`${uid}-kropp`} cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor={palette.body} stopOpacity="1" />
          <stop offset="65%" stopColor={palette.body} stopOpacity="0.92" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id={`${uid}-metall`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6b6055" />
          <stop offset="45%" stopColor="#3a332c" />
          <stop offset="100%" stopColor="#191512" />
        </linearGradient>
        <radialGradient id={`${uid}-ljus`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.65" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-glas`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {slug === 'dekor-pumpalykta' && (
        <g>
          <ellipse cx="32" cy="56" rx="19" ry="4.4" fill="#05060a" opacity="0.5" />
          <ellipse cx="32" cy="36" rx="26" ry="24" fill={`url(#${uid}-ljus)`} opacity="0.5" />
          <ellipse cx="32" cy="38" rx="18" ry="16" fill={`url(#${uid}-kropp)`} />
          <path d="M32 22 C28 28 28 48 32 54 C36 48 36 28 32 22 Z" fill="#000000" opacity="0.18" />
          <path d="M22 30 C18 34 18 42 22 46" stroke="#000000" strokeWidth="1.6" fill="none" opacity="0.22" />
          <path d="M42 30 C46 34 46 42 42 46" stroke="#000000" strokeWidth="1.6" fill="none" opacity="0.18" />
          <path d="M26 33 L31 37 L26 41 Z" fill="#3a1f08" />
          <path d="M38 33 L33 37 L38 41 Z" fill="#3a1f08" />
          <path d="M26 45 C29 42 35 42 38 45 C35 49 29 49 26 45 Z" fill="#3a1f08" />
          <path d="M29 45 h6" stroke={palette.glow} strokeWidth="1.4" opacity="0.85" />
          <path d="M32 22 v-6" stroke="#4f6b32" strokeWidth="3" strokeLinecap="round" />
          <path d="M32 18 C37 14 43 16 45 20 C40 22 35 21 32 18 Z" fill="#527a35" />
        </g>
      )}

      {slug === 'dekor-gravsten' && (
        <g>
          <ellipse cx="32" cy="56" rx="17" ry="4" fill="#05060a" opacity="0.5" />
          <path d="M17 56 V32 a15 15 0 0 1 30 0 V56 Z" fill={`url(#${uid}-kropp)`} />
          <path d="M20 52 V33 a12 12 0 0 1 10 -11 C23 26 20 33 20 40 Z" fill="#ffffff" opacity="0.08" />
          <path d="M25 38 h14 M32 32 v18" stroke={palette.glow} strokeWidth="2" opacity="0.45" />
          <path d="M25 50 h14" stroke="#26312e" strokeWidth="1.6" opacity="0.7" />
          <path d="M21 44 C24 46 22 50 25 52" stroke="#2c3a36" strokeWidth="1.2" fill="none" opacity="0.6" />
          <path d="M19 54 C22 51 26 53 24 56" fill="#4d6b4a" opacity="0.5" />
        </g>
      )}

      {slug === 'dekor-spoke' && (
        <g>
          <ellipse cx="32" cy="56" rx="14" ry="4" fill="#05060a" opacity="0.4" />
          <path
            d="M18 45 C15 25 24 13 32 13 C40 13 49 25 46 45 C40 41 37 47 32 41 C27 47 24 41 18 45 Z"
            fill={`url(#${uid}-kropp)`}
            opacity="0.92"
          />
          <path d="M23 42 C20 28 26 18 32 17 C27 24 25 32 26 42 Z" fill="#ffffff" opacity="0.35" />
          <ellipse cx="27" cy="30" rx="2.7" ry="3.6" fill="#241f30" />
          <ellipse cx="37" cy="30" rx="2.7" ry="3.6" fill="#241f30" />
          <circle cx="26.2" cy="28.6" r="0.8" fill="#ffffff" opacity="0.6" />
          <circle cx="36.2" cy="28.6" r="0.8" fill="#ffffff" opacity="0.6" />
          <path d="M28 38 q4 4.4 8 0" stroke="#241f30" strokeWidth="1.6" fill="none" />
        </g>
      )}

      {slug === 'dekor-lykta' && (
        <g>
          <ellipse cx="32" cy="57" rx="13" ry="3.4" fill="#05060a" opacity="0.5" />
          <ellipse cx="32" cy="38" rx="20" ry="18" fill={`url(#${uid}-ljus)`} opacity="0.45" />
          <path d="M23 50 h18 v6 h-18 Z" fill={`url(#${uid}-metall)`} />
          <path d="M21 20 h22 v31 h-22 Z" fill={`url(#${uid}-metall)`} />
          <rect x="25" y="24" width="14" height="22" rx="2" fill={`url(#${uid}-glas)`} />
          <path d="M28 26 v18 M32 25 v20 M36 26 v18" stroke="#241d14" strokeWidth="1" opacity="0.55" />
          <path d="M32 30 C34 34 34 38 32 41 C30 38 30 34 32 30 Z" fill="#fff3c9" opacity="0.9" />
          <path d="M21 20 L32 9 L43 20 Z" fill="#241f16" />
          <path d="M32 5 v5" stroke="#241f16" strokeWidth="2" />
          <path d="M24 20 h16" stroke="#6e6152" strokeWidth="1.4" opacity="0.7" />
        </g>
      )}

      {slug === 'dekor-kittel' && (
        <g>
          <ellipse cx="32" cy="55" rx="17" ry="4" fill="#05060a" opacity="0.5" />
          <ellipse cx="32" cy="38" rx="20" ry="16" fill={`url(#${uid}-ljus)`} opacity="0.4" />
          <path d="M17 40 h30 v7 a15 9 0 0 1 -30 0 Z" fill={`url(#${uid}-metall)`} />
          <ellipse cx="32" cy="40" rx="15" ry="6" fill="#1d2a18" />
          <ellipse cx="32" cy="40" rx="13" ry="4.6" fill={palette.glow} opacity="0.85" />
          <ellipse cx="28" cy="39.4" rx="4" ry="1.8" fill="#c8f0b4" opacity="0.55" />
          <path d="M20 46 q12 5 24 0" stroke="#0b0906" strokeWidth="2" fill="none" opacity="0.5" />
          <circle cx="27" cy="32" r="3" fill={palette.glow} opacity="0.7" />
          <circle cx="35" cy="26" r="2.4" fill={palette.glow} opacity="0.55" />
          <circle cx="31" cy="21" r="1.6" fill={palette.glow} opacity="0.35" />
          <path d="M18 44 l-6 3 M46 44 l6 3" stroke="#2a241d" strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {slug === 'dekor-manlykta' && (
        <g>
          <ellipse cx="32" cy="57" rx="12" ry="3.2" fill="#05060a" opacity="0.5" />
          <ellipse cx="32" cy="36" rx="18" ry="17" fill={`url(#${uid}-ljus)`} opacity="0.5" />
          <path d="M24 50 h16 v6 h-16 Z" fill={`url(#${uid}-metall)`} />
          <path d="M23 22 h18 v28 h-18 Z" fill={`url(#${uid}-metall)`} />
          <rect x="26" y="25" width="12" height="21" rx="2" fill={`url(#${uid}-glas)`} opacity="0.85" />
          <circle cx="32" cy="35" r="3.2" fill="#fbf6e4" opacity="0.85" />
          <circle cx="29" cy="31" r="0.9" fill="#ffffff" opacity="0.8" />
          <circle cx="35" cy="39" r="0.7" fill="#ffffff" opacity="0.6" />
          <path d="M23 22 L32 11 L41 22 Z" fill="#1d2334" />
          <path d="M26 21 h12" stroke="#6e7c96" strokeWidth="1.2" opacity="0.7" />
        </g>
      )}

      {!DECOR_COLORS[slug] && (
        <g>
          <circle cx="32" cy="34" r="14" fill={`url(#${uid}-kropp)`} opacity="0.85" />
          <circle cx="32" cy="34" r="6" fill={palette.glow} opacity="0.6" />
        </g>
      )}
    </svg>
  );
};

/** Förhandsvisning av en slot i avatarstudion (används för "Ta bort"). */
export const slotPreviewLook = (
  look: Record<string, string>,
  slot: AvatarSlot,
  partSlug: string | null,
): Record<string, string> => {
  const next = { ...look };
  if (partSlug) next[slot] = partSlug;
  else delete next[slot];
  return next;
};
