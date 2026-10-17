import React from 'react';
import { Lock, Sprout } from 'lucide-react';
import { GARDEN_TREE_LABELS, GardenPlot, GardenSummary, treeStageIndex } from '../lib/planner';

/** Fasta platser i scenen för trädgårdens föremål. */
const PLOT_SPOTS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 52, y: 164 },
  { x: 252, y: 164 },
  { x: 96, y: 42 },
  { x: 228, y: 42 },
];

interface Props {
  /** Trädgården räknad från serverns XP och upplåsningar. */
  garden: GardenSummary;
  /** Antal XP totalt — styr hur långt trädet har kommit. */
  totalXp: number;
}

/**
 * Trädgården: ett träd som växer när uppgifterna blir klara, och de föremål som
 * låses upp på vägen (blomma 25 XP, sol 50 XP, stjärna 75 XP, hjärta 100 XP).
 *
 * Allt som visas kommer från serverns data: XP-saldot och upplåsningarna. Vyn
 * räknar inte ut någon egen poäng och kan därför inte visa fel — är belöningarna
 * inte upplåsta visas de som låsta med sitt XP-krav.
 *
 * Trädet ritas i samma enkla stil som resten av Elda: svart, vitt och grått, och
 * mörkt läge följer med automatiskt eftersom allt använder temats färger.
 */
export const RewardGarden: React.FC<Props> = ({ garden, totalXp }) => {
  const { plots } = garden;

  return (
    <section className="card" data-testid="reward-garden">
      <div className="card-head">
        <div>
          <h2 className="card-title">Din trädgård</h2>
          <p className="card-sub">
            Trädet växer varje gång du slutför en uppgift. Föremålen låses upp på
            vägen — från blomman vid 25 XP till hjärtat vid 100 XP.
          </p>
        </div>
      </div>

      <div className="garden-scene">
        <svg
          className="garden-sky"
          viewBox="0 0 320 200"
          role="img"
          aria-label={`Trädgården visar ${GARDEN_TREE_LABELS[
            Math.min(treeStageIndex(totalXp), GARDEN_TREE_LABELS.length - 1)
          ]}, ${garden.unlockedPlots} av ${plots.length} föremål upplåsta.`}
          data-testid="garden-tree"
          data-stage={garden.stage}
        >
          <Tree stage={garden.stage} plots={plots} />
        </svg>

        <dl className="garden-facts">
          <div>
            <dt>Trädet är nu</dt>
            <dd>{garden.stageLabel}</dd>
          </div>
          <div>
            <dt>XP totalt</dt>
            <dd>{totalXp} XP</dd>
          </div>
          <div>
            <dt>Nästa växtsteg</dt>
            <dd>
              {garden.nextStage === null
                ? 'Trädet har vuxit färdigt'
                : `${garden.xpToNextStage} XP kvar`}
            </dd>
          </div>
        </dl>
      </div>

      {plots.length === 0 ? (
        <div className="state-note" role="status" data-testid="garden-empty">
          <Sprout size={15} />
          <span>
            Trädgårdens föremål finns inte i belöningsbiblioteket ännu. Be en
            administratör köra migreringen som lägger till blomma, sol, stjärna och
            hjärta — tills dess växer trädet ändå av dina XP.
          </span>
        </div>
      ) : (
        <ul className="garden-plots">
          {plots.map((plot) => (
            <li
              key={plot.id}
              className={`garden-plot ${plot.unlocked ? 'unlocked' : ''}`}
              data-testid={plot.unlocked ? 'garden-plot-unlocked' : 'garden-plot-locked'}
            >
              <span className="garden-plot-illu" aria-hidden="true">
                {plot.unlocked ? plot.illustration : <Lock size={18} />}
              </span>
              <span className="garden-plot-name">{plot.name}</span>
              <span className="garden-plot-req">
                {plot.unlocked ? 'Upplåst' : `${plot.xpRequired} XP`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

/**
 * Trädet. Höjd, stam och krona följer trädets skede, som i sin tur kommer från
 * användarens XP. Föremålen är serverns belöningar och placeras ut i den takt de
 * låses upp — scenen hittar aldrig på egna trösklar.
 */
const Tree: React.FC<{ stage: number; plots: readonly GardenPlot[] }> = ({ stage, plots }) => {
  const trunkHeight = 18 + stage * 12;
  const trunkWidth = 5 + stage;
  const crownRadius = stage === 0 ? 0 : 12 + stage * 6;
  const groundY = 170;

  return (
    <g>
      {/* Marken */}
      <line x1="0" y1={groundY} x2="320" y2={groundY} className="garden-ground" />

      {/* Fröet syns bara innan grodden har kommit upp. */}
      {stage === 0 && (
        <ellipse cx="160" cy={groundY - 4} rx="7" ry="4" className="garden-seed" />
      )}

      {stage > 0 && (
        <>
          <rect
            x={160 - trunkWidth / 2}
            y={groundY - trunkHeight}
            width={trunkWidth}
            height={trunkHeight}
            rx={trunkWidth / 2}
            className="garden-trunk"
          />
          <circle cx="160" cy={groundY - trunkHeight - crownRadius / 2} r={crownRadius} className="garden-crown" />
          {stage >= 4 && (
            <>
              <circle cx={160 - crownRadius} cy={groundY - trunkHeight} r={crownRadius / 2} className="garden-crown" />
              <circle cx={160 + crownRadius} cy={groundY - trunkHeight} r={crownRadius / 1.7} className="garden-crown" />
            </>
          )}
        </>
      )}

      {/* Föremålen runt omkring: de upplåsta belöningarna på sina platser. */}
      {plots.slice(0, PLOT_SPOTS.length).map((plot, index) => {
        const spot = PLOT_SPOTS[index];
        return (
          <text
            key={plot.id}
            x={spot.x}
            y={spot.y}
            className={`garden-symbol ${plot.unlocked ? '' : 'garden-symbol-locked'}`}
            aria-hidden="true"
          >
            {plot.unlocked ? plot.illustration : '·'}
          </text>
        );
      })}
    </g>
  );
};
