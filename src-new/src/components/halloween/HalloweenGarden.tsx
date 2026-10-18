import React, { useEffect, useMemo, useState } from 'react';
import { MousePointerClick, Plus, RotateCcw, Sparkles } from 'lucide-react';
import {
  Collectible,
  GARDEN_SLOT_COUNT,
  GardenEffect,
  SeasonConfig,
  xpUntilUnlock,
} from '../../lib/season';
import { GardenPlacement } from '../../lib/garden';
import { RewardArt } from './RewardArt';
import { halloweenBackdropVideo } from '../../lib/season-media';
import backdropImage from '../../assets/halloween-bakgrund.webp';

/**
 * Den levande Halloween-trädgården.
 *
 * Bakgrunden är säsongens motiv och ligger som ett eget lager: en video när
 * `lib/season-media.ts` hittar en, annars en stillbild. Ovanpå ritas separata
 * lager (himmel, moln, dimma, löv, fladdermöss, eldflugor och glöd från
 * marken). Motivet beskärs aldrig — det behåller sin komposition.
 *
 * Motivet har redan häxa, spöken och pumpor. De figurerna ritas därför inte en
 * gång till; den enda undantagna figuren är spöket som hör till milstolpen
 * "Tio klara".
 *
 * Bilden dras mycket långsamt isär (Ken Burns) så att scenen lever även utan
 * video. Den rörelsen stängs av för den som har reducerad rörelse påslagen, och
 * då visas alltid stillbilden i stället för videon.
 *
 * Föremålen som ställs ut är elevens faktiskt upplåsta belöningar. Låsta
 * föremål syns bara i samlingen nedanför, aldrig i trädgården.
 */

/** Beskrivningen av motivet, som text för skärmläsare. */
const backdropAlt =
  'Halloween-trädgården: en månbelyst höstträdgård med pumpalyktor, lyktor, spöken och en häxa på kvast.';

/** Sant när användaren har bett systemet om mindre rörelse. */
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
interface Props {
  season: SeasonConfig;
  /** Alla föremål i säsongen, både låsta och upplåsta. */
  items: readonly Collectible[];
  placements: readonly GardenPlacement[];
  effects: readonly GardenEffect[];
  totalXp: number;
  placementError: string | null;
  busyKey: string | null;
  onRemove: (itemKey: string) => void;
  onRetryPlacements: () => void;
}

const BAT_PATHS: ReadonlyArray<{
  top: number;
  delay: number;
  duration: number;
  scale: number;
  reverse?: boolean;
}> = [
  { top: 12, delay: 0, duration: 26, scale: 1 },
  { top: 28, delay: 7, duration: 34, scale: 0.7 },
  { top: 6, delay: 16, duration: 30, scale: 0.85 },
  { top: 42, delay: 3, duration: 38, scale: 0.55, reverse: true },
  { top: 20, delay: 21, duration: 44, scale: 0.6, reverse: true },
];

/** Stilla stjärnor som blinkar på natthimlen. */
const STARS: ReadonlyArray<{ left: number; top: number; delay: number; duration: number }> = [
  { left: 5, top: 9, delay: 0, duration: 4.2 },
  { left: 13, top: 24, delay: 1.6, duration: 5.4 },
  { left: 22, top: 12, delay: 3.1, duration: 3.6 },
  { left: 31, top: 5, delay: 0.7, duration: 4.8 },
  { left: 58, top: 7, delay: 2.2, duration: 5.8 },
  { left: 67, top: 18, delay: 4.4, duration: 3.9 },
  { left: 76, top: 8, delay: 1.1, duration: 5.1 },
  { left: 86, top: 26, delay: 3.8, duration: 4.5 },
  { left: 94, top: 12, delay: 0.3, duration: 6.2 },
  { left: 9, top: 46, delay: 2.7, duration: 5.6 },
  { left: 92, top: 48, delay: 1.9, duration: 4.1 },
  { left: 44, top: 4, delay: 5.2, duration: 4.9 },
];

/** Glödande aska som stiger från pumporna. */
const EMBERS: ReadonlyArray<{ left: number; delay: number; duration: number }> = [
  { left: 38, delay: 0, duration: 6.5 },
  { left: 41, delay: 1.8, duration: 7.4 },
  { left: 44, delay: 3.4, duration: 5.8 },
  { left: 40, delay: 5.1, duration: 8.1 },
  { left: 83, delay: 0.6, duration: 7.8 },
  { left: 86, delay: 2.4, duration: 6.2 },
  { left: 89, delay: 4.2, duration: 7.1 },
  { left: 85, delay: 5.8, duration: 8.6 },
];

const LEAVES: ReadonlyArray<{ left: number; delay: number; duration: number }> = [
  { left: 8, delay: 0, duration: 22 },
  { left: 26, delay: 5, duration: 27 },
  { left: 48, delay: 11, duration: 24 },
  { left: 66, delay: 3, duration: 30 },
  { left: 86, delay: 15, duration: 26 },
];

const FIREFLIES: ReadonlyArray<{ left: number; top: number; delay: number; duration: number }> = [
  { left: 14, top: 62, delay: 0, duration: 9 },
  { left: 32, top: 74, delay: 2, duration: 11 },
  { left: 55, top: 66, delay: 4, duration: 8 },
  { left: 72, top: 78, delay: 1, duration: 12 },
  { left: 88, top: 60, delay: 6, duration: 10 },
];

const BatGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 120 60" className={className} aria-hidden="true" focusable="false">
    <path
      d="M60 28c-5-3-9-12-19-14 4 5 3 10 5 15-5-2-9-1-13 2 8 1 12 5 16 10 4-4 7-5 11-5 4 0 7 1 11 5 4-5 8-9 16-10-4-3-8-4-13-2 2-5 1-10 5-15-10 2-14 11-19 14z"
      fill="currentColor"
    />
    <ellipse cx="60" cy="32" rx="4" ry="6" fill="currentColor" />
    <path d="M57 25l-1-6 4 4zM63 25l1-6-4 4z" fill="currentColor" />
  </svg>
);

const GhostGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 100 120" className={className} aria-hidden="true" focusable="false">
    <path
      d="M50 8C31 8 21 22 21 40v48c0 6 5 9 9 5l5-5 6 7 6-7 6 7 6-7 5 5c4 4 9 1 9-5V40C71 22 69 8 50 8z"
      fill="currentColor"
    />
    <ellipse cx="41" cy="42" rx="4" ry="6" fill="#241a3d" opacity="0.75" />
    <ellipse cx="59" cy="42" rx="4" ry="6" fill="#241a3d" opacity="0.75" />
    <path d="M45 56c3 3 7 3 10 0-1 5-8 5-10 0z" fill="#241a3d" opacity="0.6" />
  </svg>
);

const ShootingStar: React.FC<{ delay: number; top: number; left: number }> = ({ delay, top, left }) => (
  <span
    className="hh-shooting-star"
    style={{ top: `${top}%`, left: `${left}%`, animationDelay: `${delay}s` }}
    aria-hidden="true"
  />
);

export const HalloweenGarden: React.FC<Props> = ({
  season,
  items,
  placements,
  effects,
  totalXp,
  placementError,
  busyKey,
  onRemove,
  onRetryPlacements,
}) => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const backdropVideo = halloweenBackdropVideo();
  const effectSet = useMemo(() => new Set(effects), [effects]);

  const placeable = useMemo(
    () => items.filter((item) => item.unlocked && item.placementKey && item.artKey),
    [items],
  );
  const byKey = useMemo(() => {
    const map = new Map<string, Collectible>();
    for (const item of placeable) map.set(item.placementKey as string, item);
    return map;
  }, [placeable]);

  // Bara placeringar som fortfarande hör till ett upplåst föremål visas.
  const activePlacements = useMemo(
    () => placements.filter((placement) => byKey.has(placement.item_key)),
    [placements, byKey],
  );

  const bySlot = useMemo(() => {
    const map = new Map<number, GardenPlacement>();
    for (const placement of activePlacements) map.set(placement.slot, placement);
    return map;
  }, [activePlacements]);

  const unlockedCount = items.filter((item) => item.unlocked).length;
  const nextItem = useMemo(
    () => items.find((item) => !item.unlocked) ?? null,
    [items],
  );
  // Tröskeln kommer från belöningen själv, så texten kan aldrig hamna efter
  // när stegen ändras i `lib/halloween-rewards.ts`.
  const unlockHint = nextItem
    ? `Nästa föremål, ${nextItem.name}, låses upp vid ${nextItem.xpRequired} XP`
    : 'Hela samlingen är upplåst';
  const placedCount = activePlacements.length;
  // Detaljrutan visas bara så länge föremålet faktiskt står i trädgården.
  const selected =
    selectedKey && activePlacements.some((placement) => placement.item_key === selectedKey)
      ? byKey.get(selectedKey) ?? null
      : null;

  return (
    <section className="card hh-card" data-testid="halloween-garden">
      <div className="card-head">
        <div>
          <div className="hh-kicker">
            <Sparkles size={13} aria-hidden="true" /> Säsong: {season.label}
          </div>
          <h2 className="card-title">Halloween-trädgården</h2>
          <p className="card-sub">
            Din trädgård, dina upplåsta föremål och dina riktiga framsteg. Klara
            uppgifter för att tända lyktorna — allt du ser här kommer från servern.
          </p>
        </div>
        <div className="hh-season-badge" aria-hidden="true">
          <RewardArt artKey="pumpa-glod" size={44} />
        </div>
      </div>

      <div className="hh-scene" data-testid="halloween-scene">
        {backdropVideo && !reducedMotion ? (
          <video
            className="hh-backdrop"
            src={backdropVideo}
            poster={backdropImage}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-label={backdropAlt}
          />
        ) : (
          <img
            src={backdropImage}
            alt={backdropAlt}
            className="hh-backdrop hh-backdrop-drift"
            draggable={false}
          />
        )}

        <div className="hh-layer" aria-hidden="true">
          {/* Nattens toning och månsken ligger över bilden så att scenen får
              samma mörka stämning på alla skärmar. */}
          <div className="hh-night" />
          <div className="hh-cloud hh-cloud-a" />
          <div className="hh-cloud hh-cloud-b" />
          <div className="hh-cloud hh-cloud-c" />

          {STARS.map((star, index) => (
            <span
              key={`star-${index}`}
              className="hh-star"
              style={{
                left: `${star.left}%`,
                top: `${star.top}%`,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
              }}
            />
          ))}

          {effectSet.has('manskensgloria') && <div className="hh-moon-halo" />}
          {effectSet.has('dimma') && <div className="hh-fog hh-fog-strong" />}

          {BAT_PATHS.map((bat, index) => (
            <span
              key={`bat-${index}`}
              className={`hh-bat${bat.reverse ? ' hh-bat-reverse' : ''}`}
              style={{
                top: `${bat.top}%`,
                animationDelay: `${bat.delay}s`,
                animationDuration: `${bat.duration}s`,
                width: `${Math.round(62 * bat.scale)}px`,
              }}
            >
              <BatGlyph />
            </span>
          ))}

          {/* Bakgrunden har redan häxa, spöken och fladdermöss i motivet. De
              fasta figurerna ritas därför inte en gång till — bara den extra
              spökfiguren som hör till milstolpen "Tio klara". */}
          {effectSet.has('spokparaden') && (
            <span className="hh-ghost hh-ghost-c">
              <GhostGlyph />
            </span>
          )}

          {LEAVES.map((leaf, index) => (
            <span
              key={`leaf-${index}`}
              className="hh-leaf"
              style={{
                left: `${leaf.left}%`,
                animationDelay: `${leaf.delay}s`,
                animationDuration: `${leaf.duration}s`,
              }}
            />
          ))}

          <div className="hh-fog" />
          <div className="hh-fog hh-fog-upper" />

          {EMBERS.map((ember, index) => (
            <span
              key={`ember-${index}`}
              className="hh-ember"
              style={{
                left: `${ember.left}%`,
                animationDelay: `${ember.delay}s`,
                animationDuration: `${ember.duration}s`,
              }}
            />
          ))}

          {FIREFLIES.map((fly, index) => (
            <span
              key={`fly-${index}`}
              className="hh-firefly"
              style={{
                left: `${fly.left}%`,
                top: `${fly.top}%`,
                animationDelay: `${fly.delay}s`,
                animationDuration: `${fly.duration}s`,
              }}
            />
          ))}
          {effectSet.has('eldflugor') &&
            FIREFLIES.map((fly, index) => (
              <span
                key={`fly-extra-${index}`}
                className="hh-firefly hh-firefly-extra"
                style={{
                  left: `${(fly.left + 7) % 100}%`,
                  top: `${Math.max(fly.top - 9, 40)}%`,
                  animationDelay: `${fly.delay + 1.5}s`,
                  animationDuration: `${fly.duration + 2}s`,
                }}
              />
            ))}

          {effectSet.has('stjarnfall') && (
            <>
              <ShootingStar delay={0} top={8} left={22} />
              <ShootingStar delay={4.5} top={16} left={62} />
              <ShootingStar delay={9} top={5} left={78} />
            </>
          )}

          <div className="hh-glow-floor" />
        </div>

        <div className="hh-slots" role="group" aria-label="Platser i trädgården">
          {Array.from({ length: GARDEN_SLOT_COUNT }, (_, slot) => {
            const placement = bySlot.get(slot);
            const item = placement ? byKey.get(placement.item_key) ?? null : null;
            const isSelected = item?.placementKey === selectedKey;

            if (!placement || !item) {
              return (
                <span className="hh-slot hh-slot-empty" key={`slot-${slot}`}>
                  <Plus size={14} aria-hidden="true" />
                  <span className="hh-sr">Ledig plats {slot + 1}</span>
                </span>
              );
            }

            return (
              <button
                type="button"
                key={`slot-${slot}`}
                className={`hh-slot hh-slot-filled${isSelected ? ' is-selected' : ''}`}
                onClick={() => setSelectedKey(isSelected ? null : (item.placementKey as string))}
                aria-pressed={isSelected}
                aria-label={`${item.name}, placerad i trädgården. Visa detaljer.`}
              >
                <RewardArt artKey={item.artKey} size={56} title={item.name} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="hh-garden-facts">
        <div>
          <span className="hh-fact-label">Upplåsta föremål</span>
          <span className="hh-fact-value">
            {unlockedCount} av {items.length}
          </span>
        </div>
        <div>
          <span className="hh-fact-label">Platser använda</span>
          <span className="hh-fact-value">
            {placedCount} av {GARDEN_SLOT_COUNT}
          </span>
        </div>
        <div>
          <span className="hh-fact-label">Nästa föremål</span>
          <span className="hh-fact-value">
            {nextItem
              ? `${nextItem.name} · ${xpUntilUnlock(nextItem, totalXp)} XP kvar`
              : 'Hela samlingen är upplåst'}
          </span>
        </div>
      </div>

      {selected && (
        <div className="hh-selected" role="status" data-testid="garden-selected">
          <RewardArt artKey={selected.artKey} size={72} title={selected.name} />
          <div className="hh-selected-body">
            <div className="hh-selected-name">{selected.name}</div>
            {selected.description && (
              <p className="hh-selected-desc">{selected.description}</p>
            )}
            <div className="hh-selected-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => onRemove(selected.placementKey as string)}
                disabled={busyKey === selected.placementKey}
              >
                <RotateCcw size={14} /> Ta bort från trädgården
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedKey(null)}
              >
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}

      {placementError ? (
        <div className="hh-note hh-note-warn" role="status" data-testid="garden-place-error">
          <span>Trädgården: {placementError}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={onRetryPlacements}>
            Försök igen
          </button>
        </div>
      ) : (
        <p className="hh-hint">
          <MousePointerClick size={14} aria-hidden="true" />
          {placedCount === 0
            ? 'Välj ett upplåst föremål i samlingen nedan och ställ det i trädgården.'
            : 'Klicka på ett föremål i trädgården för att se vad det är.'}
        </p>
      )}

      {unlockedCount === 0 && (
        <div className="state-note" role="status">
          <Sparkles size={15} aria-hidden="true" />
          <span>
            Inga Halloween-föremål är upplåsta ännu. {unlockHint} — varje avklarad
            uppgift eller post i planeringen ger 10 XP.
          </span>
        </div>
      )}
    </section>
  );
};
