import React from 'react';

/**
 * Bakgrunden i elevens Halloween-rum.
 *
 * Scenen är målad i matta lager i stället för glansiga paneler: en kall
 * natthimmel med stjärnor, en stor måne med kratrar och ljusgård, kullar i tre
 * djup, ett hemsökt hus med varma fönster, nakna träd, staket, gravstenar och
 * en grusgång. Inga starka reflexer – det är lyktorna och dekorationerna som
 * ska lysa, inte ramen runt dem.
 *
 * Allt ritas som SVG så att scenen är skarp på alla skärmar och kan skalas
 * utan att ladda några bilder. Den är dekorativ och därför dold för
 * skärmläsare; dekorationerna i rutnätet ovanpå har egna etiketter.
 */

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [26, 30, 1.4],
  [58, 16, 0.9],
  [92, 38, 1.1],
  [124, 20, 0.8],
  [158, 44, 1.2],
  [196, 26, 0.9],
  [232, 48, 1.3],
  [268, 18, 0.8],
  [302, 40, 1.1],
  [340, 22, 0.9],
  [372, 12, 0.8],
  [430, 34, 1.2],
  [458, 58, 0.9],
  [74, 62, 0.8],
  [214, 70, 0.7],
  [318, 66, 0.8],
  [280, 8, 0.7],
  [12, 52, 0.8],
  [104, 74, 0.7],
  [352, 56, 0.7],
];

const GRAVES: ReadonlyArray<readonly [number, number, number]> = [
  [58, 238, 13],
  [82, 246, 10],
  [112, 240, 12],
  [138, 248, 9],
];

/** Fönster med spröjs – återanvänds för husets båda sidor. */
const window = (x: number, y: number, w: number, h: number, opacity: number) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="1" fill="url(#rum-fonster)" opacity={opacity} />
    <path
      d={`M${x} ${y + h / 2} h${w} M${x + w / 2} ${y} v${h}`}
      stroke="#1b1c26"
      strokeWidth="1.6"
      opacity="0.85"
    />
    <path
      d={`M${x - 1.5} ${y - 1.5} h${w + 3} v${h + 3} h-${w + 3} Z`}
      fill="none"
      stroke="#2c2e3c"
      strokeWidth="1.4"
      opacity="0.8"
    />
  </g>
);

export const HalloweenRoomScene: React.FC = () => (
  <svg
    className="halloween-room-scene"
    viewBox="0 0 480 280"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden
    focusable="false"
  >
    <defs>
      <linearGradient id="rum-himmel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#111726" />
        <stop offset="46%" stopColor="#182030" />
        <stop offset="100%" stopColor="#252a38" />
      </linearGradient>
      <linearGradient id="rum-mark" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stopColor="#242833" />
        <stop offset="38%" stopColor="#191c24" />
        <stop offset="100%" stopColor="#0a0c10" />
      </linearGradient>
      <linearGradient id="rum-stig" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a3740" />
        <stop offset="100%" stopColor="#1e1c22" />
      </linearGradient>
      <linearGradient id="rum-hus" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2c2e3a" />
        <stop offset="100%" stopColor="#1a1c26" />
      </linearGradient>
      <linearGradient id="rum-tak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#262936" />
        <stop offset="100%" stopColor="#151721" />
      </linearGradient>
      <linearGradient id="rum-fonster" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffdda6" />
        <stop offset="100%" stopColor="#d08c3c" />
      </linearGradient>
      <radialGradient id="rum-mane" cx="38%" cy="32%" r="66%">
        <stop offset="0%" stopColor="#fffbef" />
        <stop offset="58%" stopColor="#eee7d2" />
        <stop offset="100%" stopColor="#c9c0a7" />
      </radialGradient>
      <radialGradient id="rum-mane-glod" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#eae4d0" stopOpacity="0.3" />
        <stop offset="42%" stopColor="#eae4d0" stopOpacity="0.11" />
        <stop offset="100%" stopColor="#eae4d0" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="rum-ljus" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffcf8b" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#ffcf8b" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="rum-horisont" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#8fa2c4" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#8fa2c4" stopOpacity="0" />
      </radialGradient>
    </defs>

    {/* himmel */}
    <rect width="480" height="280" fill="url(#rum-himmel)" />
    <ellipse cx="150" cy="196" rx="210" ry="70" fill="url(#rum-horisont)" />

    {/* stjärnor */}
    {STARS.map(([cx, cy, r], index) => (
      <circle
        key={`${cx}-${cy}`}
        cx={cx}
        cy={cy}
        r={r}
        fill="#eef2fb"
        opacity={0.24 + ((index * 7) % 5) * 0.12}
      />
    ))}

    {/* måne med kratrar och ljusgård */}
    <circle cx="386" cy="58" r="64" fill="url(#rum-mane-glod)" />
    <circle cx="386" cy="58" r="22" fill="url(#rum-mane)" />
    <circle cx="377" cy="51" r="4.8" fill="#d5cdb3" opacity="0.45" />
    <circle cx="394" cy="63" r="3.6" fill="#d5cdb3" opacity="0.38" />
    <circle cx="388" cy="43" r="2.6" fill="#d5cdb3" opacity="0.3" />
    <circle cx="378" cy="69" r="2.3" fill="#d5cdb3" opacity="0.28" />
    <circle cx="397" cy="47" r="1.8" fill="#d5cdb3" opacity="0.22" />

    {/* avlägsen skogslinje */}
    <path
      d="M0 170 L14 152 L24 162 L36 144 L46 160 L60 150 L74 164 L88 154 L102 166 L118 156 L132 168 L148 158 L162 170 L178 160 L192 170 L210 162 L226 170 L242 160 L258 170 L276 162 L292 170 L310 160 L326 170 L344 162 L360 170 L378 160 L392 170 L410 162 L426 170 L444 160 L458 170 L480 160 L480 280 L0 280 Z"
      fill="#101520"
      opacity="0.9"
    />

    {/* kullar i tre djup */}
    <path
      d="M0 184 C56 158 108 168 156 178 C210 190 252 172 306 176 C362 180 414 168 480 186 L480 280 L0 280 Z"
      fill="#181f2b"
    />
    <path
      d="M0 204 C68 186 124 196 182 202 C246 210 306 194 368 200 C414 204 450 198 480 206 L480 280 L0 280 Z"
      fill="#121821"
    />

    {/* hemsökt hus */}
    <g>
      <ellipse cx="148" cy="214" rx="86" ry="34" fill="url(#rum-ljus)" opacity="0.5" />
      <path d="M96 218 V154 L150 116 L204 154 V218 Z" fill="url(#rum-hus)" />
      <path d="M96 155 L150 117 L204 155 L150 128 Z" fill="#343747" opacity="0.55" />
      <path d="M86 158 L150 110 L214 158 L204 162 L150 120 L96 162 Z" fill="url(#rum-tak)" />
      <path d="M90 157 L150 114" stroke="#59607a" strokeWidth="1.6" fill="none" opacity="0.75" />
      <path d="M150 114 L210 157" stroke="#2a2d3a" strokeWidth="1.6" fill="none" opacity="0.8" />
      <path d="M150 117 V96 H164 V126 Z" fill="#242734" />
      <path d="M147 96 h20 v4 h-20 Z" fill="#313545" />
      <path d="M146 100 h22 v3 h-22 Z" fill="#1b1d26" opacity="0.7" />
      <g fill="#454c5e" opacity="0.26">
        <circle cx="157" cy="88" r="5.5" />
        <circle cx="163" cy="78" r="7.5" />
        <circle cx="156" cy="66" r="9.5" opacity="0.75" />
        <circle cx="166" cy="54" r="7" opacity="0.5" />
      </g>
      {window(108, 168, 19, 23, 0.95)}
      {window(170, 168, 19, 23, 0.5)}
      <rect x="140" y="188" width="17" height="30" rx="2" fill="#0b0c12" />
      <path d="M140 188 h17 v6 h-17 Z" fill="#2a2d3a" opacity="0.8" />
      <circle cx="154" cy="204" r="1.4" fill="#c9a86a" opacity="0.8" />
      <path d="M96 218 h108" stroke="#2f3342" strokeWidth="3" />
      <path d="M100 218 v7 h100 v-7" fill="#1c1f29" />
      <path d="M104 218 v-4 h92 v4" stroke="#3a3f4f" strokeWidth="1.2" fill="none" opacity="0.7" />
      <ellipse cx="117" cy="186" rx="38" ry="32" fill="url(#rum-ljus)" opacity="0.75" />
      <ellipse cx="180" cy="186" rx="28" ry="24" fill="url(#rum-ljus)" opacity="0.35" />
    </g>

    {/* staket */}
    <g>
      {Array.from({ length: 10 }, (_, index) => 206 + index * 16).map((x) => (
        <g key={x}>
          <path d={`M${x} 228 V206`} stroke="#262a35" strokeWidth="3" strokeLinecap="round" />
          <path d={`M${x - 3} 208 L${x} 202 L${x + 3} 208`} stroke="#262a35" strokeWidth="2" fill="none" />
        </g>
      ))}
      <path d="M204 210 H354 M204 221 H354" stroke="#262a35" strokeWidth="2" />
    </g>

    {/* nakna träd */}
    {[
      { x: 30, scale: 1.04 },
      { x: 456, scale: 0.9 },
    ].map(({ x, scale }) => (
      <g
        key={x}
        transform={`translate(${x} 236) scale(${scale})`}
        stroke="#151922"
        fill="none"
        strokeLinecap="round"
      >
        <path d="M0 0 V-106" strokeWidth="11" />
        <path d="M0 -60 L-30 -90 M0 -74 L32 -102 M0 -40 L-40 -66 M0 -50 L42 -72" strokeWidth="5" />
        <path d="M-30 -90 L-42 -104 M32 -102 L44 -116 M-40 -66 L-56 -76 M42 -72 L58 -82" strokeWidth="3" />
        <path d="M0 -92 L-14 -116 M0 -96 L16 -120" strokeWidth="2.4" opacity="0.9" />
        <path d="M-14 -116 L-20 -128 M16 -120 L22 -132" strokeWidth="1.8" opacity="0.8" />
        <path d="M-42 -104 L-48 -114 M44 -116 L50 -126" strokeWidth="1.6" opacity="0.7" />
      </g>
    ))}

    {/* grusgång mot huset */}
    <path d="M222 280 L238 218 L262 218 L282 280 Z" fill="url(#rum-stig)" opacity="0.9" />
    {[
      [246, 240, 4.6, 2.2],
      [256, 258, 6.2, 2.6],
      [241, 268, 5, 2.4],
      [262, 230, 3.6, 1.8],
      [252, 276, 3, 1.4],
    ].map(([cx, cy, rx, ry]) => (
      <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} fill="#46434d" opacity="0.4" />
    ))}

    {/* marken */}
    <path d="M0 218 C82 210 158 224 238 218 C318 212 402 224 480 216 L480 280 L0 280 Z" fill="url(#rum-mark)" />
    <path
      d="M0 218 C82 210 158 224 238 218 C318 212 402 224 480 216"
      stroke="#3d4657"
      strokeWidth="1.2"
      fill="none"
      opacity="0.4"
    />

    {/* grästuvor */}
    {[20, 62, 150, 196, 302, 352, 404, 448].map((x, index) => (
      <path
        key={x}
        d={`M${x} 252 l4 -11 l4 11 M${x - 3} 258 l3 -8 l3 8`}
        stroke="#232a36"
        strokeWidth="1.6"
        fill="none"
        opacity={0.6 - index * 0.03}
      />
    ))}

    {/* gravstenar */}
    {GRAVES.map(([x, y, w]) => (
      <g key={x}>
        <ellipse cx={x} cy={y + 8} rx={w * 0.9} ry={3} fill="#05060a" opacity="0.5" />
        <path
          d={`M${x - w / 2} ${y + 6} V${y - w * 0.4} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V${y + 6} Z`}
          fill="#3b4642"
        />
        <path d={`M${x - w / 2 + 2} ${y + 4} V${y - w * 0.35}`} stroke="#515d58" strokeWidth="1.2" opacity="0.55" />
        <path d={`M${x - w / 4} ${y - 2} h${w / 2} M${x} ${y - 7} v11`} stroke="#232b28" strokeWidth="1.6" opacity="0.8" />
      </g>
    ))}

    {/* pumpor */}
    {[
      [212, 244, 8],
      [338, 240, 7],
      [462, 248, 6],
      [188, 252, 5],
    ].map(([x, y, r]) => (
      <g key={x}>
        <ellipse cx={x} cy={y + r * 0.8} rx={r} ry={r * 0.3} fill="#05070a" opacity="0.55" />
        <ellipse cx={x} cy={y} rx={r} ry={r * 0.84} fill="#a9541c" />
        <path d={`M${x} ${y - r * 0.78} C${x - r * 0.3} ${y - r * 0.4} ${x - r * 0.3} ${y + r * 0.5} ${x} ${y + r * 0.7}`} stroke="#8d4315" strokeWidth="1" fill="none" opacity="0.5" />
        <ellipse cx={x - r * 0.24} cy={y - r * 0.26} rx={r * 0.32} ry={r * 0.24} fill="#c9762c" opacity="0.6" />
        <path d={`M${x} ${y - r * 0.8} v-4`} stroke="#3f5528" strokeWidth="2.4" strokeLinecap="round" />
      </g>
    ))}

    {/* dimma längs marken – matta band, inga glansiga lager */}
    <ellipse cx="120" cy="234" rx="156" ry="16" fill="#aab8c8" opacity="0.06" />
    <ellipse cx="366" cy="244" rx="152" ry="17" fill="#aab8c8" opacity="0.055" />
    <ellipse cx="244" cy="220" rx="198" ry="12" fill="#aab8c8" opacity="0.045" />
  </svg>
);

export default HalloweenRoomScene;
