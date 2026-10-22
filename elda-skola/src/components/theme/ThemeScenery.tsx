import React from 'react';
import { useHalloween } from '../../lib/halloween-context';
import { FREE_THEME_KEY } from '../../lib/halloween-catalog';

/**
 * Scenen som hör till varje tema.
 *
 * Temana byter inte bara färger: varje köpt tema har sin egen silhuett mot
 * skärmkanterna – pumpor, ett spökhus, en häxkittel, en mörk skog, en neonmåne,
 * en kyrkogård i månsken eller ett godiskrypta. Scenen ligger fast under allt
 * innehåll (`z-index: 0`, `pointer-events: none`), så text och knappar påverkas
 * aldrig. Det fria säsongstemat får bara en diskret antydan, eftersom appens
 * ljusa ytor ska vara kvar.
 *
 * Scenen ritas bara när eleven själv har temat aktivt: `themeKey` kommer från
 * servern och från den inloggade elevens eget val, aldrig från webbläsaren.
 */

const VIEW = '0 0 1440 900';

/* --------------------------------------------------------------- pumpor */

const Pumpkin: React.FC<{ x: number; y: number; r: number; flip?: boolean }> = ({
  x,
  y,
  r,
  flip,
}) => (
  <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} className="scenery-glow">
    <ellipse cx={0} cy={r * 0.95} rx={r * 1.05} ry={r * 0.22} fill="#000" opacity="0.45" />
    <ellipse cx={0} cy={0} rx={r} ry={r * 0.86} fill="#d9761f" />
    <ellipse cx={-r * 0.42} cy={0} rx={r * 0.4} ry={r * 0.84} fill="#b95c14" opacity="0.75" />
    <ellipse cx={r * 0.42} cy={0} rx={r * 0.4} ry={r * 0.84} fill="#b95c14" opacity="0.75" />
    <ellipse cx={0} cy={0} rx={r * 0.26} ry={r * 0.82} fill="#f2913a" opacity="0.5" />
    <path
      d={`M${-r * 0.6} ${-r * 0.22} L${-r * 0.14} ${-r * 0.06} L${-r * 0.6} ${r * 0.12} Z`}
      fill="#3a1d06"
    />
    <path
      d={`M${r * 0.6} ${-r * 0.22} L${r * 0.14} ${-r * 0.06} L${r * 0.6} ${r * 0.12} Z`}
      fill="#3a1d06"
    />
    <path
      d={`M${-r * 0.5} ${r * 0.36} q${r * 0.5} ${r * 0.34} ${r} 0 q${-r * 0.5} ${-r * 0.2} ${-r} 0 Z`}
      fill="#3a1d06"
    />
    <path
      d={`M${-r * 0.08} ${-r * 0.84} q${r * 0.1} ${-r * 0.3} ${r * 0.24} ${-r * 0.4}`}
      stroke="#4f6b32"
      strokeWidth={r * 0.16}
      fill="none"
      strokeLinecap="round"
    />
  </g>
);

const Bat: React.FC<{ x: number; y: number; s: number; delay?: number }> = ({
  x,
  y,
  s,
  delay = 0,
}) => (
  <g
    transform={`translate(${x} ${y}) scale(${s})`}
    fill="#0a0810"
    opacity="0.85"
    className="scenery-float"
    style={{ animationDelay: `${delay}s` }}
  >
    <path d="M0 0 C-4 -6 -14 -8 -20 -3 C-15 -1 -12 3 -9 7 C-6 3 -3 1 0 3 C3 1 6 3 9 7 C12 3 15 -1 20 -3 C14 -8 4 -6 0 0 Z" />
  </g>
);

/* --------------------------------------------------------------- teman */

const PumpaScene = () => (
  <>
    <defs>
      <radialGradient id="pumpa-varm" cx="18%" cy="88%" r="52%">
        <stop offset="0%" stopColor="#f08a34" stopOpacity="0.24" />
        <stop offset="100%" stopColor="#f08a34" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="pumpa-varm-hoger" cx="88%" cy="92%" r="44%">
        <stop offset="0%" stopColor="#ffb361" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#ffb361" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="1440" height="900" fill="url(#pumpa-varm)" />
    <rect width="1440" height="900" fill="url(#pumpa-varm-hoger)" />
    <path
      d="M0 742 C180 690 320 726 470 748 C640 774 760 716 930 730 C1100 744 1260 700 1440 726 L1440 900 L0 900 Z"
      fill="#120c08"
      opacity="0.9"
    />
    <path d="M0 806 C240 770 400 812 620 800 C860 786 1080 824 1440 790 L1440 900 L0 900 Z" fill="#0a0705" />
    <Pumpkin x={150} y={806} r={78} />
    <Pumpkin x={302} y={838} r={54} flip />
    <Pumpkin x={1290} y={812} r={88} flip />
    <Pumpkin x={1150} y={846} r={50} />
    <Pumpkin x={700} y={862} r={42} />
    <Bat x={1140} y={84} s={1.4} />
    <Bat x={1340} y={168} s={1} delay={1.4} />
    <Bat x={980} y={228} s={0.8} delay={2.6} />
    <g stroke="#6b8b3a" strokeWidth="6" fill="none" opacity="0.5">
      <path d="M60 0 C80 70 40 120 70 170" />
      <path d="M156 0 C170 80 132 118 158 186" />
      <path d="M1360 0 C1380 74 1344 124 1372 182" />
    </g>
    <g fill="#f7c873" opacity="0.55">
      <circle cx={240} cy={300} r="3" />
      <circle cx={520} cy={470} r="2.5" />
      <circle cx={1180} cy={330} r="3.4" />
      <circle cx={980} cy={520} r="2" />
    </g>
  </>
);

const SpokhusScene = () => (
  <>
    <defs>
      <radialGradient id="spok-moon" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f2f7ff" />
        <stop offset="70%" stopColor="#cfe2ff" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#a8c9ff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="spok-fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#8fb8e8" stopOpacity="0" />
        <stop offset="100%" stopColor="#8fb8e8" stopOpacity="0.22" />
      </linearGradient>
    </defs>
    <circle cx="215" cy="676" r="210" fill="url(#spok-moon)" opacity="0.55" />
    <circle cx="215" cy="676" r="72" fill="#eaf2ff" opacity="0.9" />
    <path
      d="M0 760 C220 726 380 762 560 748 C720 736 860 770 1010 752 L1010 900 L0 900 Z"
      fill="#080d16"
    />
    <g fill="#0b1220">
      <path d="M1010 900 V470 h60 V900 Z" />
      <path d="M1010 470 L1040 392 L1070 470 Z" />
      <path d="M1120 900 V560 h210 V900 Z" />
      <path d="M1205 560 V470 h40 V560 Z" />
      <path d="M1205 470 L1225 402 L1245 470 Z" />
      <path d="M940 900 V620 h170 V900 Z" />
      <path d="M1025 620 L1080 520 L1135 620 Z" />
      <path d="M1330 900 V640 h110 V900 Z" />
      <path d="M1385 640 L1440 552 L1440 900 L1330 900 Z" />
    </g>
    <g fill="#ffcf7a" opacity="0.85" className="scenery-glow">
      <rect x="1060" y="620" width="26" height="40" rx="4" />
      <rect x="1160" y="640" width="26" height="40" rx="4" />
      <rect x="1250" y="660" width="26" height="40" rx="4" />
      <rect x="1180" y="780" width="34" height="46" rx="6" opacity="0.5" />
    </g>
    <g transform="translate(600 636) scale(2.4)" opacity="0.5" className="scenery-drift" fill="#eef4ff">
      <path d="M8 40 C5 20 14 8 22 8 C30 8 39 20 36 40 C30 36 27 42 22 36 C17 42 14 36 8 40 Z" />
      <ellipse cx="17" cy="24" rx="2.6" ry="3.6" fill="#111a2a" />
      <ellipse cx="27" cy="24" rx="2.6" ry="3.6" fill="#111a2a" />
    </g>
    <rect y="560" width="1440" height="340" fill="url(#spok-fog)" className="scenery-fog" />
    <g stroke="#0a0f18" strokeWidth="7" fill="none" opacity="0.9">
      <path d="M1440 0 C1330 60 1370 150 1290 210 C1230 256 1240 330 1300 380" />
      <path d="M1290 210 C1240 200 1200 220 1186 246" />
      <path d="M0 90 C90 120 120 196 200 236" />
      <path d="M200 236 C250 226 286 240 300 262" />
    </g>
    <g fill="#8fb8e8" opacity="0.5">
      <circle cx="470" cy="520" r="2.4" />
      <circle cx="560" cy="600" r="1.8" />
      <circle cx="880" cy="470" r="2.8" />
    </g>
  </>
);

const HaxkonstScene = () => (
  <>
    <defs>
      <radialGradient id="hax-brew" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#9fe37a" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#9fe37a" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="hax-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffd79a" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#ffd79a" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="1440" height="900" fill="url(#hax-glow)" opacity="0.5" />
    <path d="M0 800 C260 772 520 810 760 796 C1020 780 1240 812 1440 792 L1440 900 L0 900 Z" fill="#0c0a07" />
    {/* Kittel */}
    <g transform="translate(210 760)" className="scenery-glow">
      <ellipse cx="0" cy="0" rx="150" ry="96" fill="url(#hax-brew)" opacity="0.5" />
      <path d="M-110 0 h220 l-14 46 a96 40 0 0 1 -192 0 Z" fill="#211a13" />
      <ellipse cx="0" cy="0" rx="110" ry="30" fill="#11170d" />
      <ellipse cx="0" cy="-2" rx="96" ry="24" fill="#7fc06f" opacity="0.85" />
      <ellipse cx="-26" cy="-6" rx="30" ry="8" fill="#c9f0ad" opacity="0.6" />
      <path d="M-150 -26 q30 -18 60 -2 M150 -26 q-30 -18 -60 -2" stroke="#2c2318" strokeWidth="10" fill="none" strokeLinecap="round" />
      <g fill="#a8e88a" opacity="0.7" className="scenery-rise">
        <circle cx="-40" cy="-60" r="13" />
        <circle cx="18" cy="-96" r="9" />
        <circle cx="54" cy="-140" r="6" />
      </g>
    </g>
    {/* Häxhatt */}
    <g transform="translate(1230 190) rotate(-8)" className="scenery-float">
      <ellipse cx="0" cy="96" rx="150" ry="30" fill="#20160f" />
      <path d="M-96 92 C-70 10 -20 -90 30 -180 C34 -96 66 -8 96 92 Z" fill="#241a12" />
      <path d="M-70 66 C-40 4 -2 -70 30 -140 C36 -70 62 -2 74 66 Z" fill="#2f2318" opacity="0.7" />
      <rect x="-74" y="60" width="150" height="24" rx="6" fill="#6b5330" />
      <rect x="-20" y="62" width="40" height="20" rx="4" fill="#d9b26a" />
    </g>
    {/* Hängande örter */}
    <g stroke="#5f7a3c" strokeWidth="5" fill="none" opacity="0.55">
      <path d="M1300 0 C1310 62 1284 92 1300 138" />
      <path d="M1352 0 C1362 50 1338 78 1352 122" />
      <path d="M1404 0 C1414 68 1392 96 1404 150" />
    </g>
    <g fill="#6b8b45" opacity="0.55">
      <ellipse cx="1300" cy="144" rx="14" ry="22" />
      <ellipse cx="1352" cy="126" rx="11" ry="17" />
      <ellipse cx="1404" cy="156" rx="12" ry="20" />
    </g>
    {/* Ljus */}
    <g transform="translate(860 800)">
      {[0, 66, 132].map((dx, index) => (
        <g key={dx} transform={`translate(${dx} ${index === 1 ? -26 : 0})`}>
          <rect x="-11" y="-52" width="22" height="60" rx="4" fill="#e8dcc4" />
          <path d="M0 -66 C8 -58 9 -50 0 -44 C-9 -50 -8 -58 0 -66 Z" fill="#ffd28a" className="scenery-flicker" />
        </g>
      ))}
    </g>
    {/* Trollbok */}
    <g transform="translate(1180 820) rotate(-4)" opacity="0.95">
      <path d="M-110 0 h220 v22 h-220 Z" fill="#3a2a1c" />
      <path d="M-100 -22 h200 l-8 22 h-192 Z" fill="#5b3f28" />
      <path d="M-78 -8 h156" stroke="#d9b26a" strokeWidth="3" opacity="0.7" />
    </g>
    {/* Spindelnät */}
    <g stroke="#d9c9a8" strokeWidth="2" fill="none" opacity="0.35">
      <path d="M0 0 L190 0 M0 0 L150 120 M0 0 L70 190" />
      <path d="M60 0 q-6 54 -60 60 M120 0 q-12 100 -120 118" />
    </g>
    <g fill="#c8f0b4" opacity="0.5">
      <circle cx="560" cy="420" r="3" />
      <circle cx="980" cy="360" r="2.4" />
      <circle cx="1340" cy="520" r="3.2" />
    </g>
  </>
);

const ForestScene = () => (
  <>
    <defs>
      <linearGradient id="forest-fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6fdcc0" stopOpacity="0" />
        <stop offset="100%" stopColor="#6fdcc0" stopOpacity="0.16" />
      </linearGradient>
      <radialGradient id="forest-moon" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#e7fff7" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#6fdcc0" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="1170" cy="96" r="132" fill="url(#forest-moon)" opacity="0.7" />
    <circle cx="1170" cy="96" r="50" fill="#dffcf2" opacity="0.5" />
    <path d="M0 700 C220 660 420 706 640 690 C880 672 1120 712 1440 686 L1440 900 L0 900 Z" fill="#08120f" />
    {/* Bakre stammar */}
    <g fill="#12241e" opacity="0.95">
      <path d="M120 900 V300 l34 -6 v606 Z" />
      <path d="M190 900 V420 l26 -4 v484 Z" />
      <path d="M1260 900 V260 l40 -8 v648 Z" />
      <path d="M1210 900 V440 l28 -6 v466 Z" />
      <path d="M560 900 V520 l20 -4 v384 Z" opacity="0.7" />
      <path d="M900 900 V560 l18 -4 v344 Z" opacity="0.7" />
    </g>
    {/* Grenar */}
    <g stroke="#12241e" strokeWidth="14" fill="none" strokeLinecap="round">
      <path d="M137 320 C210 280 250 236 300 210" />
      <path d="M137 380 C60 344 30 300 0 286" />
      <path d="M1280 352 C1340 318 1384 296 1440 288" />
      <path d="M250 236 C240 200 250 176 270 152" />
    </g>
    {/* Främre stammar */}
    <g fill="#050c0a">
      <path d="M-20 900 V120 l66 -10 v790 Z" />
      <path d="M1470 900 V90 l-70 -12 v822 Z" />
      <path d="M300 900 V620 l36 -6 v286 Z" opacity="0.85" />
      <path d="M1120 900 V660 l34 -6 v246 Z" opacity="0.85" />
    </g>
    <rect y="520" width="1440" height="380" fill="url(#forest-fog)" className="scenery-fog" />
    <g fill="#a5f5e2" className="scenery-flicker">
      <circle cx="420" cy="520" r="4" opacity="0.85" />
      <circle cx="500" cy="610" r="2.6" opacity="0.7" />
      <circle cx="760" cy="470" r="3.2" opacity="0.75" />
      <circle cx="980" cy="600" r="3.8" opacity="0.8" />
      <circle cx="660" cy="690" r="2.2" opacity="0.6" />
    </g>
    <g fill="#0a1613" opacity="0.9">
      <path d="M860 900 C860 840 880 800 900 800 C920 800 940 840 940 900 Z" opacity="0.5" />
    </g>
  </>
);

const MidnightScene = () => (
  <>
    <defs>
      <linearGradient id="mid-moon" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffd9f4" />
        <stop offset="55%" stopColor="#e3a6ff" />
        <stop offset="100%" stopColor="#8b46c9" />
      </linearGradient>
      <radialGradient id="mid-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#c65cff" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#c65cff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="mid-hill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3a2350" />
        <stop offset="100%" stopColor="#100a1a" />
      </linearGradient>
    </defs>
    <circle cx="1140" cy="880" r="280" fill="url(#mid-halo)" opacity="0.7" />
    <g fill="#fff" opacity="0.8" className="scenery-flicker">
      {[
        [180, 120, 2.4],
        [320, 260, 1.8],
        [520, 90, 2.2],
        [680, 300, 1.6],
        [820, 130, 2.6],
        [1320, 360, 2],
        [1260, 90, 1.8],
        [420, 420, 1.6],
        [960, 470, 2],
      ].map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
      ))}
    </g>
    <Bat x={520} y={180} s={1.8} />
    <Bat x={700} y={260} s={1.1} delay={1.8} />
    <Bat x={880} y={110} s={1.3} delay={3.1} />
    <path
      d="M0 700 C200 650 360 700 560 676 C780 650 980 700 1160 668 C1280 646 1370 660 1440 646 L1440 900 L0 900 Z"
      fill="url(#mid-hill)"
    />
    <path
      d="M0 700 C200 650 360 700 560 676 C780 650 980 700 1160 668 C1280 646 1370 660 1440 646"
      stroke="#ff8a5c"
      strokeWidth="2.5"
      fill="none"
      opacity="0.55"
    />
    <path
      d="M0 812 C260 780 460 820 700 806 C940 790 1180 826 1440 796 L1440 900 L0 900 Z"
      fill="#0a0713"
    />
    {/* Neonsolen står över kullarna i nederkanten, där ytan är öppen. */}
    <circle cx="1140" cy="792" r="84" fill="url(#mid-moon)" opacity="0.95" />
    <circle cx="1140" cy="792" r="116" stroke="#e0a6ff" strokeWidth="2" fill="none" opacity="0.45" />
    <circle cx="1140" cy="792" r="148" stroke="#c65cff" strokeWidth="1.5" fill="none" opacity="0.28" />
    {/* Lyktor */}
    <g transform="translate(240 800)">
      <path d="M0 -96 V0" stroke="#2a1d3c" strokeWidth="6" />
      <rect x="-16" y="-96" width="32" height="42" rx="6" fill="#2a1d3c" />
      <rect x="-11" y="-90" width="22" height="30" rx="4" fill="#ffb066" opacity="0.9" />
      <circle cx="0" cy="-75" r="34" fill="#ff8a5c" opacity="0.22" />
    </g>
    <g transform="translate(430 838)">
      <path d="M0 -78 V0" stroke="#2a1d3c" strokeWidth="5" />
      <rect x="-13" y="-78" width="26" height="34" rx="5" fill="#2a1d3c" />
      <rect x="-9" y="-73" width="18" height="24" rx="3" fill="#ffb066" opacity="0.85" />
      <circle cx="0" cy="-61" r="26" fill="#ff8a5c" opacity="0.2" />
    </g>
  </>
);

const GhostlyScene = () => (
  <>
    <defs>
      <radialGradient id="ghost-halo" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#f4f9ff" stopOpacity="0.85" />
        <stop offset="55%" stopColor="#c9dcf2" stopOpacity="0.22" />
        <stop offset="100%" stopColor="#9fb8d6" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="ghost-mist" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cfe0f4" stopOpacity="0" />
        <stop offset="100%" stopColor="#cfe0f4" stopOpacity="0.2" />
      </linearGradient>
    </defs>
    <circle cx="1190" cy="700" r="250" fill="url(#ghost-halo)" opacity="0.75" />
    <circle cx="1190" cy="700" r="96" fill="#f2f7ff" opacity="0.85" />
    <circle cx="1190" cy="700" r="140" stroke="#dbe8f7" strokeWidth="2" fill="none" opacity="0.4" />
    <circle cx="1226" cy="684" r="14" fill="#c6d6e8" opacity="0.35" />
    <circle cx="1158" cy="722" r="20" fill="#c6d6e8" opacity="0.3" />
    <path d="M0 780 C240 744 420 786 640 772 C860 758 1120 790 1440 764 L1440 900 L0 900 Z" fill="#080d16" />
    {/* Gravstenar med jordhögar, målade i silhuett mot dimman. */}
    <g fill="#0b1420" opacity="0.85">
      <ellipse cx="204" cy="812" rx="54" ry="10" />
      <ellipse cx="330" cy="818" rx="40" ry="8" />
      <ellipse cx="1124" cy="824" rx="64" ry="12" />
      <ellipse cx="1262" cy="816" rx="38" ry="8" />
    </g>
    <g fill="#141c28" stroke="#33445a" strokeWidth="2">
      <path d="M170 810 V730 a34 34 0 0 1 68 0 V810 Z" />
      <path d="M196 760 h16 M204 752 v28" stroke="#51647c" strokeWidth="3" opacity="0.75" fill="none" />
      <g transform="rotate(-6 326 816)">
        <path d="M300 816 V760 a26 26 0 0 1 52 0 V816 Z" />
      </g>
      <path d="M1080 820 V722 a44 44 0 0 1 88 0 V820 Z" />
      <path d="M1114 756 h40 M1134 734 v46" stroke="#51647c" strokeWidth="4" opacity="0.75" fill="none" />
      <g transform="rotate(5 1262 814)">
        <path d="M1238 814 V762 a24 24 0 0 1 48 0 V814 Z" />
      </g>
    </g>
    <rect y="520" width="1440" height="380" fill="url(#ghost-mist)" className="scenery-fog" />
    <g stroke="#0a1019" strokeWidth="6" fill="none" opacity="0.9">
      <path d="M1440 140 C1330 180 1360 260 1270 300 C1210 328 1216 386 1266 420" />
      <path d="M1270 300 C1226 288 1196 302 1182 322" />
    </g>
    <g transform="translate(520 640) scale(2.1)" opacity="0.6" className="scenery-drift" fill="#eaf2ff">
      <path d="M8 40 C5 20 14 8 22 8 C30 8 39 20 36 40 C30 36 27 42 22 36 C17 42 14 36 8 40 Z" />
      <ellipse cx="17" cy="24" rx="2.6" ry="3.6" fill="#0b1220" />
      <ellipse cx="27" cy="24" rx="2.6" ry="3.6" fill="#0b1220" />
    </g>
    <g fill="#dbe8f7" opacity="0.5">
      <circle cx="900" cy="640" r="2.4" />
      <circle cx="720" cy="560" r="1.8" />
    </g>
  </>
);

const CandyScene = () => (
  <>
    <defs>
      <radialGradient id="candy-glow" cx="50%" cy="70%" r="60%">
        <stop offset="0%" stopColor="#ff9ec4" stopOpacity="0.35" />
        <stop offset="100%" stopColor="#8ff0d5" stopOpacity="0" />
      </radialGradient>
      <pattern id="candy-stripes" width="34" height="34" patternTransform="rotate(38)" patternUnits="userSpaceOnUse">
        <rect width="34" height="34" fill="#fff0f6" />
        <rect width="17" height="34" fill="#ff7fae" />
      </pattern>
    </defs>
    <rect width="1440" height="900" fill="url(#candy-glow)" />
    <path d="M0 800 C240 768 420 808 660 792 C900 776 1140 812 1440 786 L1440 900 L0 900 Z" fill="#160d1a" />
    {/* Polkagrisar i nederkanten, där ytan är öppen. */}
    <g transform="translate(150 890)">
      <path d="M0 0 V-110 a38 38 0 0 1 76 0 V-142" stroke="url(#candy-stripes)" strokeWidth="32" fill="none" strokeLinecap="round" />
    </g>
    <g transform="translate(1290 890) scale(-1 1)">
      <path d="M0 0 V-96 a32 32 0 0 1 64 0 V-124" stroke="url(#candy-stripes)" strokeWidth="28" fill="none" strokeLinecap="round" />
    </g>
    {/* Klubbor med synlig pinne */}
    <g transform="translate(430 870)">
      <path d="M0 0 V-78" stroke="#f4f0e4" strokeWidth="9" />
      <circle cy="-112" r="50" fill="#ff9ec4" />
      <path d="M-50 -112 a50 50 0 0 1 50 -50 a50 50 0 0 1 0 100 a25 25 0 0 1 0 -50 a25 25 0 0 0 0 -50" fill="#fff0f6" opacity="0.88" />
    </g>
    <g transform="translate(1010 880)">
      <path d="M0 0 V-62" stroke="#f4f0e4" strokeWidth="8" />
      <circle cy="-92" r="40" fill="#8ff0d5" />
      <path d="M-40 -92 a40 40 0 0 1 40 -40 a40 40 0 0 1 0 80 a20 20 0 0 1 0 -40 a20 20 0 0 0 0 -40" fill="#f4fffb" opacity="0.88" />
    </g>
    {/* Majskarameller */}
    <g transform="translate(700 862)">
      <path d="M0 0 L-34 0 L0 -84 L34 0 Z" fill="#ffe2a8" />
      <path d="M-12 -30 L-24 0 L24 0 L12 -30 Z" fill="#ff9ec4" />
      <path d="M-4 -50 L-12 -30 L12 -30 L4 -50 Z" fill="#fff0f6" />
    </g>
    <g transform="translate(790 878) scale(0.7)">
      <path d="M0 0 L-34 0 L0 -84 L34 0 Z" fill="#ffe2a8" />
      <path d="M-12 -30 L-24 0 L24 0 L12 -30 Z" fill="#8ff0d5" />
      <path d="M-4 -50 L-12 -30 L12 -30 L4 -50 Z" fill="#fff0f6" />
    </g>
    {/* Godis vid kanten */}
    <g>
      <ellipse cx="600" cy="884" rx="44" ry="26" fill="#ffc2d8" />
      <ellipse cx="900" cy="890" rx="34" ry="20" fill="#b6f5e4" />
      <ellipse cx="1160" cy="880" rx="40" ry="24" fill="#d8c2ff" />
      <ellipse cx="1080" cy="894" rx="28" ry="17" fill="#ffe2a8" />
    </g>
    {/* Strössel */}
    <g strokeWidth="6" strokeLinecap="round" opacity="0.85">
      <path d="M300 720 l22 16" stroke="#ff9ec4" />
      <path d="M520 690 l18 -20" stroke="#8ff0d5" />
      <path d="M860 730 l24 -10" stroke="#ffe2a8" />
      <path d="M1160 700 l16 20" stroke="#d8c2ff" />
      <path d="M700 760 l22 12" stroke="#ff9ec4" />
    </g>
    <g fill="#fff6fa" opacity="0.7" className="scenery-flicker">
      <circle cx="640" cy="160" r="3" />
      <circle cx="960" cy="140" r="2.4" />
      <circle cx="1320" cy="420" r="2.8" />
    </g>
  </>
);

const FreeScene = () => (
  <>
    <defs>
      <radialGradient id="fri-varm" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#c47a1e" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#c47a1e" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="1240" cy="780" r="330" fill="url(#fri-varm)" />
    <circle cx="120" cy="120" r="260" fill="url(#fri-varm)" />
    <g opacity="0.5">
      <Pumpkin x={1300} y={866} r={44} />
      <Pumpkin x={1190} y={884} r={30} flip />
    </g>
    <g opacity="0.45">
      <Bat x={1120} y={120} s={1.1} />
      <Bat x={1260} y={200} s={0.8} delay={2} />
    </g>
    <g stroke="#a37a3f" strokeWidth="1.6" fill="none" opacity="0.22">
      <path d="M1440 0 L1180 0 M1440 0 L1290 120 M1440 0 L1360 200" />
      <path d="M1300 0 q-8 60 -80 96 M1380 0 q-14 120 -140 150" />
    </g>
  </>
);

/* --------------------------------------------------------------- motiv */

/** Litet emblem för temakortet i shopen. */
export const ThemeMotif: React.FC<{ themeKey: string; size?: number }> = ({ themeKey, size = 44 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    'aria-hidden': true as const,
    focusable: 'false' as const,
    className: 'theme-motif',
  };

  switch (themeKey) {
    case 'pumpa':
      return (
        <svg {...common}>
          <ellipse cx="32" cy="53" rx="22" ry="5" fill="#000" opacity="0.35" />
          <ellipse cx="32" cy="34" rx="21" ry="19" fill="#e5822a" />
          <ellipse cx="21" cy="34" rx="8" ry="18" fill="#c2681a" opacity="0.7" />
          <ellipse cx="43" cy="34" rx="8" ry="18" fill="#c2681a" opacity="0.7" />
          <path d="M24 28 l6 4 -6 4 Z" fill="#3a1d06" />
          <path d="M40 28 l-6 4 6 4 Z" fill="#3a1d06" />
          <path d="M24 42 q8 7 16 0 q-8 -4 -16 0 Z" fill="#3a1d06" />
          <path d="M32 16 v-5" stroke="#5d7d34" strokeWidth="4" strokeLinecap="round" />
        </svg>
      );
    case 'spokhus':
      return (
        <svg {...common}>
          <circle cx="46" cy="18" r="9" fill="#dbe7f7" />
          <path d="M10 56 V34 l12 -10 12 10 v22 Z" fill="#1a2434" />
          <path d="M34 56 V40 h18 v16 Z" fill="#141d2b" />
          <rect x="16" y="38" width="6" height="8" fill="#ffcf7a" />
          <rect x="26" y="38" width="6" height="8" fill="#ffcf7a" opacity="0.7" />
          <rect x="42" y="44" width="5" height="7" fill="#ffcf7a" opacity="0.85" />
        </svg>
      );
    case 'haxkonst':
      return (
        <svg {...common}>
          <ellipse cx="30" cy="54" rx="22" ry="6" fill="#0f150b" />
          <path d="M14 34 h34 l-4 16 a17 8 0 0 1 -26 0 Z" fill="#2b2118" />
          <ellipse cx="31" cy="34" rx="17" ry="6" fill="#7fc06f" />
          <circle cx="26" cy="24" r="4" fill="#a8e88a" opacity="0.85" />
          <circle cx="34" cy="16" r="3" fill="#a8e88a" opacity="0.6" />
          <path d="M12 32 q6 -4 10 -1 M50 32 q-6 -4 -10 -1" stroke="#3b2f20" strokeWidth="3" />
        </svg>
      );
    case 'haunted-forest':
      return (
        <svg {...common}>
          <circle cx="42" cy="18" r="9" fill="#dffcf2" opacity="0.7" />
          <path d="M16 56 V24 l6 -2 v34 Z" fill="#12241e" />
          <path d="M22 30 C28 26 30 22 34 20" stroke="#12241e" strokeWidth="4" fill="none" />
          <path d="M46 56 V32 l5 -2 v26 Z" fill="#0a1613" />
          <circle cx="30" cy="42" r="2.4" fill="#a5f5e2" />
          <circle cx="38" cy="50" r="1.8" fill="#a5f5e2" opacity="0.8" />
        </svg>
      );
    case 'midnight':
      return (
        <svg {...common}>
          <circle cx="40" cy="24" r="14" fill="#d9a6ff" />
          <circle cx="34" cy="20" r="14" fill="#171123" opacity="0.85" />
          <g fill="#fff">
            <circle cx="18" cy="16" r="1.8" />
            <circle cx="50" cy="42" r="2" />
            <circle cx="26" cy="36" r="1.4" />
            <circle cx="14" cy="46" r="1.6" />
          </g>
          <path d="M8 54 q12 -6 24 0 q10 4 24 0" stroke="#ff8a5c" strokeWidth="2" fill="none" opacity="0.7" />
        </svg>
      );
    case 'ghostly-moonlight':
      return (
        <svg {...common}>
          <circle cx="32" cy="22" r="13" fill="#f2f7ff" opacity="0.9" />
          <circle cx="32" cy="22" r="19" stroke="#dbe8f7" strokeWidth="1.6" fill="none" opacity="0.5" />
          <path d="M18 56 V46 a8 8 0 0 1 16 0 v10 Z" fill="#1b2432" />
          <path d="M40 56 V44 h14 v12 Z" fill="#141b26" />
          <path d="M24 50 h4 M26 48 v4" stroke="#5a6d84" strokeWidth="1.6" />
          <path d="M10 58 h44" stroke="#cfe0f4" strokeWidth="2" opacity="0.35" />
        </svg>
      );
    case 'candy-crypt':
      return (
        <svg {...common}>
          <defs>
            <pattern id="motif-candy" width="10" height="10" patternTransform="rotate(40)" patternUnits="userSpaceOnUse">
              <rect width="10" height="10" fill="#fff0f6" />
              <rect width="5" height="10" fill="#ff7fae" />
            </pattern>
          </defs>
          <path d="M22 56 V26 a9 9 0 0 1 18 0 v-4" stroke="url(#motif-candy)" strokeWidth="12" fill="none" strokeLinecap="round" />
          <circle cx="46" cy="44" r="10" fill="#8ff0d5" />
          <circle cx="14" cy="48" r="8" fill="#ffe2a8" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M20 26 q10 -8 24 0 q-8 4 -12 10 q-4 -6 -12 -10 Z" fill="#c47a1e" opacity="0.7" />
          <ellipse cx="34" cy="46" rx="12" ry="10" fill="#e5822a" opacity="0.8" />
          <path d="M29 42 l4 3 -4 3 Z" fill="#2a1708" />
          <path d="M39 42 l-4 3 4 3 Z" fill="#2a1708" />
        </svg>
      );
  }
};

/* --------------------------------------------------------------- scenen */

const SCENES: Record<string, React.FC> = {
  [FREE_THEME_KEY]: FreeScene,
  pumpa: PumpaScene,
  spokhus: SpokhusScene,
  haxkonst: HaxkonstScene,
  'haunted-forest': ForestScene,
  midnight: MidnightScene,
  'ghostly-moonlight': GhostlyScene,
  'candy-crypt': CandyScene,
};

/**
 * Den fasta scenen för det aktiva temat. Renderas bara för den inloggade
 * eleven som har temat påslaget, och ligger bakom allt innehåll. `themeKey`
 * kan skickas in av förhandsvisningen; annars avgör den inloggade elevens
 * utrustade tema.
 */
export const ThemeScenery: React.FC<{ themeKey?: string | null }> = ({ themeKey }) => {
  const { themeKey: activeTheme } = useHalloween();
  const key = themeKey ?? activeTheme;
  const Scene = key ? SCENES[key] : undefined;
  if (!key || !Scene) return null;

  return (
    <div className="theme-scenery" aria-hidden="true" data-scenery={key}>
      <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
        <Scene />
      </svg>
    </div>
  );
};
