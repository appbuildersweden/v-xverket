import React, { useId } from 'react';
import { SeasonArtKey, seasonArtKey } from '../../lib/season';

/**
 * Ritade föremål för Halloween-trädgården.
 *
 * Varje föremål är en egen SVG med gradienter, skuggor och ljus — inga emojis.
 * Grafiken skalas utan att bli suddig, följer med i bygget och kräver inga
 * externa filer eller nätverk. Nycklarna matchar `unlocks_items` i databasen.
 */
interface ArtProps {
  /** Unikt id-prefix så att gradienter inte krockar mellan två föremål. */
  uid: string;
}

const GlowDefs: React.FC<{ uid: string; color: string; strength?: number }> = ({
  uid,
  color,
  strength = 4,
}) => (
  <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation={strength} result="blur" />
    <feFlood floodColor={color} floodOpacity="0.55" result="tint" />
    <feComposite in="tint" in2="blur" operator="in" result="soft" />
    <feMerge>
      <feMergeNode in="soft" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
);

const PumpkinArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <radialGradient id={`${uid}-p`} cx="42%" cy="32%" r="72%">
        <stop offset="0%" stopColor="#ffc46b" />
        <stop offset="48%" stopColor="#f0821f" />
        <stop offset="100%" stopColor="#9c3a08" />
      </radialGradient>
      <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6d8a3c" />
        <stop offset="100%" stopColor="#2f4318" />
      </linearGradient>
      <GlowDefs uid={uid} color="#ff8d2b" />
    </defs>
    <ellipse cx="60" cy="105" rx="34" ry="6" fill="#000" opacity="0.28" />
    <g filter={`url(#${uid}-glow)`}>
      <ellipse cx="37" cy="73" rx="21" ry="28" fill={`url(#${uid}-p)`} />
      <ellipse cx="83" cy="73" rx="21" ry="28" fill={`url(#${uid}-p)`} />
      <ellipse cx="60" cy="70" rx="27" ry="33" fill={`url(#${uid}-p)`} />
      <path
        d="M36 49c7-7 41-7 48 0"
        stroke="#ffd08a"
        strokeWidth="1.4"
        fill="none"
        opacity="0.45"
      />
      <path
        d="M60 40v58M40 44c-5 8-6 20-2 30M80 44c5 8 6 20 2 30"
        stroke="#b34d0c"
        strokeWidth="1.6"
        fill="none"
        opacity="0.45"
      />
    </g>
    <path
      d="M56 40c-1-7 2-11 7-13-2 5-1 9 2 12z"
      fill={`url(#${uid}-stem)`}
      stroke="#4c672a"
      strokeWidth="1.2"
    />
    <path
      d="M62 30c4-6 9-7 13-5-4 2-6 5-6 9"
      fill="none"
      stroke="#6d8a3c"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <g fill="#2a1405">
      <path d="M41 62l7-12 7 12z" />
      <path d="M65 62l7-12 7 12z" />
      <path d="M44 77c5-5 7 3 11 0 3-2 4-6 8-2 3 3 5-2 9 0l-3 8c-6 5-17 5-22 0z" />
    </g>
    <path d="M30 55c-6 6-6 18-1 24" stroke="#ffb35c" strokeWidth="1.4" fill="none" opacity="0.5" />
    <path d="M91 55c6 6 6 18 1 24" stroke="#7a2c06" strokeWidth="1.4" fill="none" opacity="0.35" />
  </g>
);

const GhostArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#e6ecff" />
        <stop offset="100%" stopColor="#a9b8e8" />
      </linearGradient>
      <GlowDefs uid={uid} color="#bcd0ff" strength={5} />
    </defs>
    <ellipse cx="60" cy="106" rx="26" ry="5" fill="#000" opacity="0.22" />
    <g filter={`url(#${uid}-glow)`}>
      <path
        d="M60 16c-18 0-28 14-28 32v36c0 6 5 9 9 5l6-6 7 7 6-7 6 7 7-7 6 6c4 4 9 1 9-5V48c0-18-10-32-28-32z"
        fill={`url(#${uid}-g)`}
      />
    </g>
    <path
      d="M42 36c3-10 10-15 18-16"
      stroke="#ffffff"
      strokeWidth="3"
      fill="none"
      strokeLinecap="round"
      opacity="0.85"
    />
    <g fill="#2c2a4a">
      <ellipse cx="50" cy="52" rx="4.4" ry="6" />
      <ellipse cx="70" cy="52" rx="4.4" ry="6" />
      <path d="M55 66c3 3 8 3 11 0-2 6-9 6-11 0z" />
    </g>
    <ellipse cx="42" cy="62" rx="5" ry="3" fill="#b9a6ff" opacity="0.3" />
    <ellipse cx="78" cy="62" rx="5" ry="3" fill="#b9a6ff" opacity="0.3" />
    <path d="M32 78c-6 2-8 7-6 11M88 78c6 2 8 7 6 11" stroke="#dfe6ff" strokeWidth="3" fill="none" strokeLinecap="round" />
  </g>
);

const BatArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-b`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#4b3570" />
        <stop offset="100%" stopColor="#160f26" />
      </linearGradient>
      <GlowDefs uid={uid} color="#8a5cff" strength={3} />
    </defs>
    <ellipse cx="60" cy="104" rx="20" ry="4" fill="#000" opacity="0.2" />
    <g filter={`url(#${uid}-glow)`} fill={`url(#${uid}-b)`}>
      <path d="M58 55c-6-3-12-14-24-16 5 6 4 12 7 18-6-2-10 0-14 3 9 1 13 6 18 12 5-5 9-6 13-6z" />
      <path d="M62 55c6-3 12-14 24-16-5 6-4 12-7 18 6-2 10 0 14 3-9 1-13 6-18 12-5-5-9-6-13-6z" />
      <ellipse cx="60" cy="66" rx="9" ry="12" />
      <path d="M52 56l-2-10 8 6zM68 56l2-10-8 6z" />
    </g>
    <g fill="#ff7a4d">
      <circle cx="56" cy="64" r="1.9" />
      <circle cx="64" cy="64" r="1.9" />
    </g>
    <path d="M60 76v6M56 82l-3 4M64 82l3 4" stroke="#2a1c44" strokeWidth="2" strokeLinecap="round" />
    <path d="M30 32l4 4M88 26l3 5M70 20l2 4" stroke="#c9b6ff" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
  </g>
);

const CatArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-c`} x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor="#3a2f57" />
        <stop offset="55%" stopColor="#171225" />
        <stop offset="100%" stopColor="#08060e" />
      </linearGradient>
      <GlowDefs uid={uid} color="#c08bff" strength={3} />
    </defs>
    <ellipse cx="60" cy="106" rx="30" ry="5" fill="#000" opacity="0.3" />
    <g filter={`url(#${uid}-glow)`}>
      <path
        d="M75 45c8-2 12 4 12 12 0 9-6 14-13 14 4 8 4 20-3 27H54c-3-10 0-19 7-25-6-4-9-10-9-17 0-11 7-19 17-19 7 0 11 2 15 5z"
        fill={`url(#${uid}-c)`}
      />
      <path d="M52 38l-4-11 12 5zM76 34l8-9 2 12z" fill={`url(#${uid}-c)`} />
      <path d="M78 88c10-4 12-14 8-20-2 8-7 11-13 12" fill={`url(#${uid}-c)`} />
    </g>
    <g fill="#ffc04d">
      <ellipse cx="53" cy="47" rx="3.6" ry="4.6" />
      <ellipse cx="70" cy="46" rx="3.6" ry="4.6" />
    </g>
    <g fill="#1a1024">
      <ellipse cx="53" cy="47.5" rx="1.2" ry="4" />
      <ellipse cx="70" cy="46.5" rx="1.2" ry="4" />
    </g>
    <path d="M60 58h3l-1.5 3z" fill="#e07a8a" />
    <path d="M58 63c1 2 3 2 4 0" stroke="#e07a8a" strokeWidth="1.4" fill="none" />
    <path d="M36 58l-10-3M36 63l-10 1M84 57l9-4M84 62l9 1" stroke="#b9a8d8" strokeWidth="1.2" opacity="0.5" />
  </g>
);

const HatArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-h`} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#5a3a8c" />
        <stop offset="60%" stopColor="#2b1a4d" />
        <stop offset="100%" stopColor="#150c26" />
      </linearGradient>
      <linearGradient id={`${uid}-band`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#8f5bd6" />
        <stop offset="100%" stopColor="#4a2a7a" />
      </linearGradient>
      <GlowDefs uid={uid} color="#8a5cff" strength={3} />
    </defs>
    <ellipse cx="60" cy="104" rx="40" ry="7" fill="#000" opacity="0.28" />
    <g filter={`url(#${uid}-glow)`}>
      <ellipse cx="60" cy="93" rx="42" ry="13" fill={`url(#${uid}-h)`} />
      <path
        d="M48 90c-2-18 6-40 18-62 5 12 9 24 10 34 1 9 2 20 3 26z"
        fill={`url(#${uid}-h)`}
      />
      <path
        d="M66 30c4-8 10-11 15-9-6 4-7 9-4 15 2 4 6 6 9 5-1 5-5 9-11 11"
        fill={`url(#${uid}-h)`}
      />
      <path d="M48 79c9 4 26 5 39 0l1 9c-12 5-29 4-41-1z" fill={`url(#${uid}-band)`} />
      <rect x="59" y="79" width="10" height="10" rx="1.6" fill="#e7b85a" opacity="0.9" />
      <rect x="62" y="82" width="4" height="4" rx="0.8" fill="#2b1a4d" />
    </g>
    <g fill="#e7b85a" opacity="0.8">
      <path d="M45 42l1.6 4 4 0.4-3 2.6 1 4-3.6-2.2-3.6 2.2 1-4-3-2.6 4-0.4z" />
      <circle cx="82" cy="64" r="1.6" />
    </g>
  </g>
);

const CauldronArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-pot`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#3b3550" />
        <stop offset="55%" stopColor="#1d1a2a" />
        <stop offset="100%" stopColor="#0c0a13" />
      </linearGradient>
      <radialGradient id={`${uid}-brew`} cx="50%" cy="40%" r="60%">
        <stop offset="0%" stopColor="#b6ff7a" />
        <stop offset="60%" stopColor="#49c94a" />
        <stop offset="100%" stopColor="#17692f" />
      </radialGradient>
      <GlowDefs uid={uid} color="#7cff6a" strength={5} />
    </defs>
    <ellipse cx="60" cy="106" rx="34" ry="5" fill="#000" opacity="0.3" />
    <g>
      <path d="M28 58h64c0 24-12 38-32 38S28 82 28 58z" fill={`url(#${uid}-pot)`} />
      <ellipse cx="60" cy="58" rx="33" ry="9" fill="#0e0b16" />
      <ellipse cx="60" cy="58" rx="28" ry="7" fill={`url(#${uid}-brew)`} filter={`url(#${uid}-glow)`} />
      <path d="M26 55c0-4 15-8 34-8s34 4 34 8-15 8-34 8-34-4-34-8z" fill="none" stroke="#5a5372" strokeWidth="3" />
      <path d="M38 94l-4 10M82 94l4 10" stroke="#2a2538" strokeWidth="6" strokeLinecap="round" />
      <path d="M34 66c2 8 6 14 12 19" stroke="#6b6486" strokeWidth="2" fill="none" opacity="0.5" />
    </g>
    <g fill="#aef78f" opacity="0.9" filter={`url(#${uid}-glow)`}>
      <circle cx="50" cy="56" r="3" />
      <circle cx="64" cy="53" r="2.2" />
      <circle cx="71" cy="58" r="1.8" />
    </g>
    <g stroke="#9bff8c" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7">
      <path d="M48 44c-3-4 1-7-2-11" />
      <path d="M63 42c-2-4 2-7-1-10" />
      <path d="M75 45c-2-3 1-5-1-8" />
    </g>
  </g>
);

const PotionArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-liq`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#ff9be0" />
        <stop offset="45%" stopColor="#c33bd4" />
        <stop offset="100%" stopColor="#54157f" />
      </linearGradient>
      <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
        <stop offset="60%" stopColor="#ffffff" stopOpacity="0.08" />
      </linearGradient>
      <GlowDefs uid={uid} color="#e06bff" strength={6} />
    </defs>
    <ellipse cx="60" cy="107" rx="24" ry="5" fill="#000" opacity="0.28" />
    <g filter={`url(#${uid}-glow)`}>
      <path
        d="M50 34h20v10c14 6 18 16 18 28 0 16-12 27-28 27S32 88 32 72c0-12 4-22 18-28z"
        fill={`url(#${uid}-liq)`}
      />
      <path
        d="M50 34h20v10c14 6 18 16 18 28 0 16-12 27-28 27S32 88 32 72c0-12 4-22 18-28z"
        fill={`url(#${uid}-glass)`}
      />
    </g>
    <rect x="48" y="24" width="24" height="12" rx="3" fill="#6b4a35" />
    <rect x="52" y="20" width="16" height="6" rx="2" fill="#8a6547" />
    <path d="M56 44v8" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
    <g fill="#ffd7f4" opacity="0.85">
      <circle cx="52" cy="70" r="2.4" />
      <circle cx="66" cy="62" r="1.8" />
      <circle cx="70" cy="82" r="2" />
    </g>
  </g>
);

const LanternArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6f6a80" />
        <stop offset="50%" stopColor="#2b2736" />
        <stop offset="100%" stopColor="#4a4459" />
      </linearGradient>
      <radialGradient id={`${uid}-flame`} cx="50%" cy="60%" r="60%">
        <stop offset="0%" stopColor="#fff6c2" />
        <stop offset="45%" stopColor="#ffc247" />
        <stop offset="100%" stopColor="#ff7a18" stopOpacity="0.2" />
      </radialGradient>
      <GlowDefs uid={uid} color="#ffb84d" strength={6} />
    </defs>
    <ellipse cx="60" cy="107" rx="24" ry="4" fill="#000" opacity="0.3" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M60 16c-10 0-18 8-18 18h36c0-10-8-18-18-18z" fill="none" stroke={`url(#${uid}-metal)`} strokeWidth="4" />
      <rect x="38" y="34" width="44" height="58" rx="6" fill="#1a1524" />
      <rect x="43" y="40" width="34" height="46" rx="3" fill={`url(#${uid}-flame)`} />
      <rect x="36" y="32" width="48" height="8" rx="3" fill={`url(#${uid}-metal)`} />
      <rect x="36" y="90" width="48" height="8" rx="3" fill={`url(#${uid}-metal)`} />
      <path d="M60 34v58M38 62h44" stroke="#4c4559" strokeWidth="3" />
      <rect x="56" y="70" width="8" height="18" rx="3" fill="#e9dcc0" />
      <path d="M60 52c5 6 7 10 7 15 0 5-3 8-7 8s-7-3-7-8c0-5 2-9 7-15z" fill="#ffe9a3" />
      <path d="M60 60c2 3 3 5 3 7 0 2-1 3-3 3s-3-1-3-3c0-2 1-4 3-7z" fill="#ffb02e" />
    </g>
  </g>
);

const CandleArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-wax`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#efe3c6" />
        <stop offset="55%" stopColor="#d9c8a3" />
        <stop offset="100%" stopColor="#b9a67e" />
      </linearGradient>
      <radialGradient id={`${uid}-fire`} cx="50%" cy="55%" r="55%">
        <stop offset="0%" stopColor="#fff9d1" />
        <stop offset="50%" stopColor="#ffc44d" />
        <stop offset="100%" stopColor="#ff7b19" stopOpacity="0.15" />
      </radialGradient>
      <GlowDefs uid={uid} color="#ffb44d" strength={6} />
    </defs>
    <ellipse cx="60" cy="107" rx="22" ry="4" fill="#000" opacity="0.28" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M46 56h28v44a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6z" fill={`url(#${uid}-wax)`} />
      <path d="M46 60c4 6 10 8 14 5 4-3 8-3 14 2v-11H46z" fill="#f3e8ce" />
      <path d="M50 62c-3 8-1 16 1 22M70 64c3 7 2 14 0 20" stroke="#f7eed6" strokeWidth="3" fill="none" strokeLinejoin="round" />
      <path d="M60 30c8 10 11 15 11 22 0 7-5 12-11 12s-11-5-11-12c0-7 3-12 11-22z" fill={`url(#${uid}-fire)`} />
      <path d="M60 40c3 5 5 8 5 12 0 3-2 5-5 5s-5-2-5-5c0-4 2-7 5-12z" fill="#fff2b0" />
    </g>
    <path d="M60 22v-6" stroke="#3a2a1a" strokeWidth="2.4" strokeLinecap="round" />
  </g>
);

const MushroomArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <radialGradient id={`${uid}-cap`} cx="45%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#a6ffe6" />
        <stop offset="45%" stopColor="#39c9b0" />
        <stop offset="100%" stopColor="#0d4f52" />
      </radialGradient>
      <linearGradient id={`${uid}-stem`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#e6f5ee" />
        <stop offset="100%" stopColor="#8fb3ad" />
      </linearGradient>
      <GlowDefs uid={uid} color="#5fffe0" strength={5} />
    </defs>
    <ellipse cx="60" cy="107" rx="32" ry="5" fill="#000" opacity="0.25" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M62 68h14v26c0 6-4 10-9 10s-9-4-9-10z" fill={`url(#${uid}-stem)`} transform="translate(-6 0)" />
      <path d="M24 66c0-17 16-29 36-29s36 12 36 29c0 6-8 8-18 8H42c-10 0-18-2-18-8z" fill={`url(#${uid}-cap)`} />
      <path d="M40 60c8 4 28 4 40 0" stroke="#0c3d45" strokeWidth="2" fill="none" opacity="0.4" />
    </g>
    <g fill="#d5fff6" opacity="0.9">
      <ellipse cx="44" cy="54" rx="5" ry="3.4" transform="rotate(-18 44 54)" />
      <ellipse cx="62" cy="46" rx="4" ry="2.8" transform="rotate(8 62 46)" />
      <ellipse cx="78" cy="57" rx="3.4" ry="2.4" transform="rotate(-12 78 57)" />
    </g>
    <g fill="#8dffe6" opacity="0.75">
      <circle cx="34" cy="34" r="2" />
      <circle cx="86" cy="30" r="1.6" />
      <circle cx="94" cy="46" r="1.3" />
      <circle cx="26" cy="50" r="1.4" />
    </g>
  </g>
);

const CrystalArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-c1`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#c8b6ff" />
        <stop offset="45%" stopColor="#7a5cff" />
        <stop offset="100%" stopColor="#34207a" />
      </linearGradient>
      <linearGradient id={`${uid}-c2`} x1="0" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#a8f4ff" />
        <stop offset="50%" stopColor="#3fc4e8" />
        <stop offset="100%" stopColor="#134c78" />
      </linearGradient>
      <GlowDefs uid={uid} color="#9a7bff" strength={6} />
    </defs>
    <ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity="0.25" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M60 14l18 26-8 42-10 14-10-14-8-42z" fill={`url(#${uid}-c1)`} />
      <path d="M60 14l18 26-18 12z" fill="#e4dbff" opacity="0.55" />
      <path d="M42 40l18-26v98l-10-14z" fill="#2a1a5e" opacity="0.35" />
      <path d="M88 58l12 14-10 20-10-22z" fill={`url(#${uid}-c2)`} />
      <path d="M28 66l10-12 8 24-8 14z" fill={`url(#${uid}-c2)`} opacity="0.85" />
    </g>
    <g fill="#ffffff" opacity="0.75">
      <path d="M60 24l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />
      <circle cx="88" cy="30" r="1.6" />
      <circle cx="34" cy="32" r="1.2" />
    </g>
  </g>
);

const RavenArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-r`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#4c5f86" />
        <stop offset="45%" stopColor="#1d2438" />
        <stop offset="100%" stopColor="#070a12" />
      </linearGradient>
      <GlowDefs uid={uid} color="#6f8fd8" strength={3} />
    </defs>
    <path d="M18 96c14-6 30-8 46-8 16 0 30 2 42 8" stroke="#2a2138" strokeWidth="5" fill="none" strokeLinecap="round" />
    <g filter={`url(#${uid}-glow)`} fill={`url(#${uid}-r)`}>
      <path d="M52 88c-4-10-2-24 6-32 5-6 12-9 20-9 7 0 12 3 15 7l-10 4c6 2 9 6 9 11 0 9-8 15-19 15 6 8 4 16-2 20-6-6-12-9-19-16z" />
      <path d="M50 52c-8-4-14-12-16-20 8 2 16 8 22 16z" />
      <path d="M84 74l10 6-12 4z" />
    </g>
    <circle cx="78" cy="54" r="2.4" fill="#e9f0ff" />
    <circle cx="78.6" cy="54" r="1.1" fill="#0a0d16" />
    <path d="M92 60l8 3-8 4z" fill="#c9a227" />
  </g>
);

const HouseArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#3b3558" />
        <stop offset="55%" stopColor="#211d33" />
        <stop offset="100%" stopColor="#100d19" />
      </linearGradient>
      <linearGradient id={`${uid}-window`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe08a" />
        <stop offset="100%" stopColor="#ff9d24" />
      </linearGradient>
      <GlowDefs uid={uid} color="#ffbe4d" strength={5} />
    </defs>
    <ellipse cx="60" cy="108" rx="40" ry="5" fill="#000" opacity="0.3" />
    <circle cx="86" cy="30" r="16" fill="#dfe6ff" opacity="0.14" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M26 96V58l14-8 10 6 12-16 12 10 12-4 14 6v44z" fill={`url(#${uid}-wall)`} />
      <path d="M26 58l14-8 10 6 12-16 12 10 12-4 14 6-14 8-12-4-12 10-12-10-10 6z" fill="#191528" />
      <path d="M38 96V70h12v26z" fill="#0d0a14" />
      <rect x="64" y="58" width="14" height="16" rx="2" fill={`url(#${uid}-window)`} />
      <rect x="64" y="58" width="14" height="16" rx="2" fill="none" stroke="#3a3252" strokeWidth="2" />
      <rect x="84" y="70" width="10" height="12" rx="2" fill={`url(#${uid}-window)`} opacity="0.85" />
      <rect x="46" y="44" width="10" height="12" rx="2" fill={`url(#${uid}-window)`} opacity="0.9" />
    </g>
    <path d="M38 58l-12 4M100 72l-8 6" stroke="#5a4f7a" strokeWidth="2" opacity="0.5" />
    <path d="M58 92c8 0 12-4 14-10" stroke="#0c0a12" strokeWidth="2" fill="none" opacity="0.6" />
  </g>
);

const CandyBagArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-bag`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#5b3d8f" />
        <stop offset="55%" stopColor="#33205c" />
        <stop offset="100%" stopColor="#1a1030" />
      </linearGradient>
      <GlowDefs uid={uid} color="#ffb35c" strength={4} />
    </defs>
    <ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity="0.28" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M40 52h40l6 40c1 7-4 12-11 12H45c-7 0-12-5-11-12z" fill={`url(#${uid}-bag)`} />
      <path d="M44 52c0-8 6-14 16-14s16 6 16 14" fill="none" stroke="#7b5cb8" strokeWidth="4" />
      <path d="M50 52l-4-10M70 52l4-10" stroke="#c9a227" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="76" r="7" fill="#f0821f" />
      <path d="M58 70c0-3 2-4 4-5-1 2 0 4 1 5" stroke="#4c672a" strokeWidth="2" fill="none" />
      <path d="M56 76l2-3 2 3zM62 76l2-3 2 3z" fill="#2a1405" />
      <path d="M50 92c6-4 8 2 12-1 3-2 4 0 8 1" stroke="#c9a227" strokeWidth="2" fill="none" opacity="0.6" />
    </g>
    <circle cx="80" cy="44" r="5" fill="#e05252" />
    <path d="M34 42l5 2-3 4z" fill="#5fbf7a" />
    <circle cx="42" cy="34" r="3.4" fill="#e8c341" />
  </g>
);

const BroomArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#b98450" />
        <stop offset="55%" stopColor="#7d5230" />
        <stop offset="100%" stopColor="#402815" />
      </linearGradient>
      <linearGradient id={`${uid}-straw`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#d8b36a" />
        <stop offset="100%" stopColor="#7c5a2c" />
      </linearGradient>
      <GlowDefs uid={uid} color="#c9a227" strength={3} />
    </defs>
    <g filter={`url(#${uid}-glow)`}>
      <path d="M70 16l10 6-34 54-8-6z" fill={`url(#${uid}-wood)`} />
      <path d="M38 68c-8 8-14 18-16 28 12 2 24-2 34-10 6-5 8-12 2-16-6-4-14-6-20-2z" fill={`url(#${uid}-straw)`} />
      <path d="M38 70l-4 26M46 72l-1 26M54 74l2 22M62 78l4 14" stroke="#a8843f" strokeWidth="2" opacity="0.7" />
      <path d="M34 68l30 2 4 8-34-2z" fill="#c9a227" opacity="0.85" />
      <path d="M36 80l30 2" stroke="#6b4a22" strokeWidth="2" opacity="0.5" />
    </g>
  </g>
);

const GhostLaptopArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-lid`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stopColor="#454066" />
        <stop offset="100%" stopColor="#171326" />
      </linearGradient>
      <linearGradient id={`${uid}-screen`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#b18cff" />
        <stop offset="55%" stopColor="#6b3fc4" />
        <stop offset="100%" stopColor="#241245" />
      </linearGradient>
      <GlowDefs uid={uid} color="#9d6bff" strength={5} />
    </defs>
    <ellipse cx="60" cy="104" rx="38" ry="5" fill="#000" opacity="0.3" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M28 76h64l8 14a4 4 0 0 1-4 5H24a4 4 0 0 1-4-5z" fill={`url(#${uid}-lid)`} />
      <path d="M34 24h52a4 4 0 0 1 4 4v48H30V28a4 4 0 0 1 4-4z" fill={`url(#${uid}-lid)`} />
      <rect x="34" y="30" width="52" height="40" rx="2" fill={`url(#${uid}-screen)`} />
      <path
        d="M60 36c-8 0-13 6-13 14v8c0 3 2 4 4 2l2-2 3 3 3-3 3 3 2-2c2 2 4 1 4-2v-8c0-8-5-14-8-14z"
        fill="#e9ddff"
        opacity="0.92"
      />
      <g fill="#3a2463">
        <ellipse cx="56" cy="48" rx="1.8" ry="2.4" />
        <ellipse cx="64" cy="48" rx="1.8" ry="2.4" />
      </g>
      <path d="M48 92h24" stroke="#3a3352" strokeWidth="3" strokeLinecap="round" />
    </g>
  </g>
);

/** Magisk bok ur Halloween-stegen: glödande sidor och en låga över uppslaget. */
const BookArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-cover`} x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0%" stopColor="#6a3fb0" />
        <stop offset="55%" stopColor="#33205c" />
        <stop offset="100%" stopColor="#160f2b" />
      </linearGradient>
      <linearGradient id={`${uid}-pages`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stopColor="#fff6d2" />
        <stop offset="60%" stopColor="#f0dcae" />
        <stop offset="100%" stopColor="#c9ad78" />
      </linearGradient>
      <radialGradient id={`${uid}-ink`} cx="50%" cy="45%" r="60%">
        <stop offset="0%" stopColor="#d8c2ff" />
        <stop offset="70%" stopColor="#7a4fd0" />
        <stop offset="100%" stopColor="#311b5e" />
      </radialGradient>
      <GlowDefs uid={uid} color="#a97bff" strength={5} />
    </defs>
    <ellipse cx="60" cy="106" rx="36" ry="5" fill="#000" opacity="0.3" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M18 84V40c0-4 3-7 7-7h66c4 0 7 3 7 7v44z" fill={`url(#${uid}-cover)`} />
      <path d="M22 40h30v44H22z" fill={`url(#${uid}-pages)`} />
      <path d="M98 40H68v44h30z" fill={`url(#${uid}-pages)`} />
      <path d="M60 34v50" stroke="#3a2160" strokeWidth="3" />
      <path d="M18 84c0 6 5 10 12 10h60c7 0 12-4 12-10z" fill="#1b1230" />
      <path d="M60 40v44" stroke="#b79ce8" strokeWidth="1.4" opacity="0.5" />
    </g>
    <g stroke="#8a63d8" strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
      <path d="M28 50h18M28 58h18M28 66h13" />
      <path d="M74 50h18M74 58h18M74 66h13" />
    </g>
    <path
      d="M60 12c7 9 10 14 10 20 0 6-4 10-10 10s-10-4-10-10c0-6 3-11 10-20z"
      fill={`url(#${uid}-ink)`}
      filter={`url(#${uid}-glow)`}
    />
    <g fill="#f0e7ff" opacity="0.8">
      <circle cx="30" cy="26" r="1.6" />
      <circle cx="92" cy="22" r="1.3" />
      <circle cx="46" cy="20" r="1.1" />
      <circle cx="76" cy="30" r="1.4" />
    </g>
  </g>
);

/** Sällsynt månlykta: en lykta fylld av månsken, sista steget i stegen. */
const MoonLanternArt: React.FC<ArtProps> = ({ uid }) => (
  <g>
    <defs>
      <linearGradient id={`${uid}-frame`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8f86ad" />
        <stop offset="45%" stopColor="#3a3450" />
        <stop offset="100%" stopColor="#5d5679" />
      </linearGradient>
      <radialGradient id={`${uid}-light`} cx="50%" cy="45%" r="65%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="40%" stopColor="#dfe8ff" />
        <stop offset="100%" stopColor="#7d8fd8" stopOpacity="0.15" />
      </radialGradient>
      <GlowDefs uid={uid} color="#cfe0ff" strength={6} />
    </defs>
    <ellipse cx="60" cy="108" rx="26" ry="4" fill="#000" opacity="0.3" />
    <circle cx="60" cy="30" r="18" fill="#dfe8ff" opacity="0.16" />
    <g filter={`url(#${uid}-glow)`}>
      <path d="M60 12c-9 0-16 7-16 16h32c0-9-7-16-16-16z" fill="none" stroke={`url(#${uid}-frame)`} strokeWidth="4" />
      <path
        d="M40 32h40c3 0 5 2 5 5v50c0 3-2 5-5 5H40c-3 0-5-2-5-5V37c0-3 2-5 5-5z"
        fill="#191428"
      />
      <rect x="40" y="38" width="40" height="46" rx="4" fill={`url(#${uid}-light)`} />
      <circle cx="60" cy="60" r="12" fill="#f4f8ff" opacity="0.9" />
      <circle cx="66" cy="55" r="10" fill={`url(#${uid}-light)`} opacity="0.95" />
      <path d="M40 32h40M35 88h50" stroke={`url(#${uid}-frame)`} strokeWidth="5" strokeLinecap="round" />
      <path d="M60 38v46M35 62h50" stroke="#4a4462" strokeWidth="3" />
      <rect x="54" y="84" width="12" height="6" rx="2" fill="#6b6488" />
    </g>
    <g fill="#ffffff" opacity="0.85">
      <path d="M82 34l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" />
      <circle cx="34" cy="26" r="1.5" />
      <circle cx="88" cy="80" r="1.2" />
    </g>
  </g>
);

const ART: Record<SeasonArtKey, React.FC<ArtProps>> = {
  'pumpa-glod': PumpkinArt,
  spoke: GhostArt,
  fladdermus: BatArt,
  katt: CatArt,
  hatt: HatArt,
  kittel: CauldronArt,
  flaska: PotionArt,
  lykta: LanternArt,
  ljus: CandleArt,
  svamp: MushroomArt,
  kristall: CrystalArt,
  kraka: RavenArt,
  hxhus: HouseArt,
  godispase: CandyBagArt,
  kvast: BroomArt,
  spokdator: GhostLaptopArt,
  bok: BookArt,
  manlykta: MoonLanternArt,
};

interface Props {
  /** Nyckel från databasen — även äldre alias fungerar. */
  artKey: string | null | undefined;
  size?: number;
  /** Låst läge: dämpad, utan glöd. */
  locked?: boolean;
  className?: string;
  title?: string;
}

/** Ritar ett Halloween-föremål. Okända nycklar får en neutral, ritad ornament. */
export const RewardArt: React.FC<Props> = ({
  artKey,
  size = 96,
  locked = false,
  className,
  title,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const key = seasonArtKey(artKey);
  const Art = key ? ART[key] : null;

  return (
    <svg
      className={`hh-art${locked ? ' hh-art-locked' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {Art ? <Art uid={uid} /> : <CrystalArt uid={uid} />}
    </svg>
  );
};
