import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock, Gift, Sparkles, X, Trophy } from 'lucide-react';
import {
  fetchRewardDefinitions,
  fetchUnlocks,
  fetchUnlockedItems,
  fetchXpState,
  fetchTasks,
  createTask,
  completeTask,
  type PlannerTask,
  type RewardDefinition,
  type XpState,
} from '../../lib/rewards';
import { Sommarang } from './Sommarang';
import { LevandeStjarnor, KonfettiExplosion } from './LevandeStjarnor';

/**
 * Belöningsytan — delad av speciallärare och elev.
 *
 * Eftersom alla tabeller är nycklade på user_id med RLS (auth.uid() = user_id)
 * får varje användare sin egen, isolerade progression automatiskt. Ingen
 * extra behörighetslogik behövs här — systemet är per användare.
 */

interface Celebration {
  reward: RewardDefinition;
  bonusXp: number;
  items: string[];
}

/**
 * Minimalt gemensamt gränssnitt som både RewardDefinition (från biblioteket)
 * och UnlockCelebration (från completeTask) kan tilldelas — så att samma
 * belöningsruta kan visas från både belöningsytan och planeringspanelen.
 */
export interface Belonningsruta {
  name: string;
  description: string | null;
  theme: string;
  illustration: string | null;
  is_final?: boolean;
  xp_required?: number;
}

/**
 * Återanvändbar belöningsruta. Används både av belöningsytan och av
 * planeringspanelen när en uppgift låser upp något.
 */
export const BelonningModal: React.FC<{
  reward: Belonningsruta | null;
  bonusXp?: number;
  items?: string[];
  onClose: () => void;
}> = ({ reward, bonusXp = 0, items = [], onClose }) => {
  if (!reward) return null;
  return (
    <div className="reward-overlay" role="dialog" aria-modal="true">
      <div className="reward-backdrop" onClick={onClose} />
      <div className={`reward-popup ${reward.theme}`}>
        <LevandeStjarnor burst burstCount={54} overlay />
        <KonfettiExplosion />
        <button className="reward-close" onClick={onClose} aria-label="Stäng">
          <X size={18} />
        </button>

        <div className="reward-popup-ribbon">
          <Gift size={16} /> GRATTIS!
        </div>

        <div className="reward-popup-illu">
          {reward.is_final ? '🎁' : (reward.illustration ?? '🎁')}
        </div>

        <h3 className="reward-popup-name">{reward.name}</h3>
        {reward.description && <p className="reward-popup-desc">{reward.description}</p>}

        {reward.is_final && (
          <p className="reward-popup-final">GRATTIS! Du har låst upp den magiska julfinalen!</p>
        )}

        <div className="reward-popup-xp">
          <Trophy size={15} />
          {bonusXp > 0
            ? `+${bonusXp} bonus-XP`
            : `${reward.xp_required ?? 0} XP nådd`}
        </div>

        {reward.is_final && items.length > 0 && (
          <div className="reward-popup-items">
            {items.map((it) => (
              <span key={it} className="reward-popup-item">{it}</span>
            ))}
          </div>
        )}

        {reward.name === 'Jens Turesson är bäst' && (
          <p className="reward-popup-diplom">📜 Officiellt bevisat: Jens Turesson är bäst</p>
        )}

        <button className="btn btn-primary" onClick={onClose}>Fortsätt</button>
      </div>
    </div>
  );
};

interface Props {
  /** Extra festlig rubriktext — annars "Belöningar & nivåer". */
  title?: string;
  subtitle?: string;
  /** Visa en kompakt egen uppgiftslista som ger XP (används för elever). */
  showQuickTasks?: boolean;
}

const THEME_LABEL: Record<RewardDefinition['theme'], string> = {
  it: 'IT & teknik',
  halloween: 'Halloween',
  special: 'Special',
  jul: 'Jul',
};

export const BelonningarYta: React.FC<Props> = ({
  title = 'Belöningar & nivåer',
  subtitle = 'Samla XP, lås upp föremål och se din trädgård växa.',
  showQuickTasks = false,
}) => {
  const [defs, setDefs] = useState<RewardDefinition[] | null>(null);
  const [unlocks, setUnlocks] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Set<string>>(new Set());
  const [xp, setXp] = useState<XpState>({
    totalXp: 0,
    level: 1,
    xpPerLevel: 100,
    intoLevel: 0,
    xpToNext: 100,
  });
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [viewingItem, setViewingItem] = useState<string | null>(null);
  const [quickTasks, setQuickTasks] = useState<PlannerTask[]>([]);
  const [quickDraft, setQuickDraft] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, u, i, x] = await Promise.all([
        fetchRewardDefinitions(),
        fetchUnlocks(),
        fetchUnlockedItems(),
        fetchXpState(),
      ]);
      setDefs(d);
      setUnlocks(new Set(u.keys()));
      setItems(i);
      setXp(x);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Kunde inte hämta belöningarna. Kontrollera att migrationen är körd.',
      );
      setDefs((prev) => prev ?? []);
    }
  }, []);

  const loadQuick = useCallback(async () => {
    try {
      const all = await fetchTasks();
      setQuickTasks(all.filter((t) => t.status !== 'klar').slice(0, 8));
    } catch {
      setQuickTasks([]);
    }
  }, []);

  useEffect(() => {
    void load();
    if (showQuickTasks) void loadQuick();
  }, [load, loadQuick, showQuickTasks]);

  const addQuick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickBusy || !quickDraft.trim()) return;
    setQuickBusy(true);
    try {
      await createTask({ title: quickDraft.trim(), category: 'studie' });
      setQuickDraft('');
      await loadQuick();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte lägga till.');
    } finally {
      setQuickBusy(false);
    }
  };

  const doQuick = async (t: PlannerTask) => {
    if (quickBusy) return;
    setQuickBusy(true);
    try {
      const r = await completeTask(t.id);
      if (r.unlocks.length > 0) {
        setQueue((prev) => [
          ...prev,
          ...r.unlocks.map((u) => ({
            reward: {
              id: u.id,
              name: u.name,
              description: u.description,
              theme: u.theme as RewardDefinition['theme'],
              position: 0,
              xp_required: 0,
              bonus_xp: u.bonusXp,
              illustration: u.illustration,
              unlocks_items: u.items,
              is_final: false,
            },
            bonusXp: u.bonusXp,
            items: u.items,
          })),
        ]);
      }
      await Promise.all([load(), loadQuick()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte markera som klar.');
    } finally {
      setQuickBusy(false);
    }
  };

  // Vissa nästa celebration när nya upplåsningar köar.
  useEffect(() => {
    if (celebration || queue.length === 0) return;
    const [next, ...rest] = queue;
    setCelebration(next);
    setQueue(rest);
  }, [celebration, queue]);

  const closeCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  const unlockedCount = useMemo(
    () => defs?.filter((d) => unlocks.has(d.id)).length ?? 0,
    [defs, unlocks],
  );

  const nextReward = useMemo(() => {
    if (!defs) return null;
    return defs.find((d) => !unlocks.has(d.id)) ?? null;
  }, [defs, unlocks]);

  const progressPct = useMemo(() => {
    if (!nextReward) return 100;
    if (nextReward.xp_required <= xp.totalXp) return 100;
    return Math.min(100, Math.round((xp.totalXp / nextReward.xp_required) * 100));
  }, [nextReward, xp.totalXp]);

  const byTheme = useMemo(() => {
    const groups: Array<{ theme: RewardDefinition['theme']; rewards: RewardDefinition[] }> = [];
    for (const d of defs ?? []) {
      const g = groups.find((x) => x.theme === d.theme);
      if (g) g.rewards.push(d);
      else groups.push({ theme: d.theme, rewards: [d] });
    }
    return groups;
  }, [defs]);

  if (error && !defs) {
    return (
      <div className="card">
        <div className="card-title">Belöningar</div>
        <div className="login-err" role="alert" style={{ marginTop: 8 }}>
          {error}
        </div>
        <button className="btn btn-outline btn-sm" style={{ marginTop: 10 }} onClick={() => void load()}>
          Försök igen
        </button>
      </div>
    );
  }

  return (
    <div className="belonningar-yta">
      {/* ---------------------------------------------------------- XP-header */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">{title}</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>{subtitle}</div>
          </div>
          <span className="badge badge-solid">Nivå {xp.level}</span>
        </div>

        <div className="progress-row">
          <span>{xp.totalXp} XP samlade</span>
          <b>
            {nextReward
              ? `${Math.max(0, nextReward.xp_required - xp.totalXp)} XP kvar till ${nextReward.name}`
              : 'Alla belöningar upplåsta!'}
          </b>
        </div>
        <div className="progress">
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="mini-stats" style={{ marginTop: 4 }}>
          <div className="mini-stat">
            <div className="lbl">Totalt</div>
            <div className="val">{xp.totalXp}</div>
            <div className="det">XP</div>
          </div>
          <div className="mini-stat">
            <div className="lbl">Nivå</div>
            <div className="val">{xp.level}</div>
            <div className="det">{xp.xpToNext} XP till {xp.level + 1}</div>
          </div>
          <div className="mini-stat">
            <div className="lbl">Upplåsta</div>
            <div className="val">{unlockedCount}</div>
            <div className="det">av {defs?.length ?? 0} belöningar</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- Egna uppgifter */}
      {showQuickTasks && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Dina uppgifter</div>
              <div className="card-sub" style={{ marginBottom: 0 }}>
                Gör klart en uppgift och tjäna XP
              </div>
            </div>
          </div>

          <form onSubmit={addQuick} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              value={quickDraft}
              onChange={(e) => setQuickDraft(e.target.value)}
              placeholder="T.ex. Läs kapitel 3 i svenska"
              disabled={quickBusy}
              aria-label="Ny uppgift"
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={quickBusy || !quickDraft.trim()}
            >
              Lägg till
            </button>
          </form>

          {quickTasks.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Inga aktiva uppgifter ännu. Lägg till en ovan.
            </p>
          ) : (
            quickTasks.map((t) => (
              <div className="list-item" key={t.id}>
                <div className="stat-icon" style={{ width: 32, height: 32 }}>
                  <Sparkles size={14} />
                </div>
                <div className="list-item-content">
                  <div className="list-item-title">{t.title}</div>
                  <div className="list-item-sub">
                    {t.category}
                    {t.due_date ? ` • ${t.due_date}` : ''}
                  </div>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void doQuick(t)}
                  disabled={quickBusy}
                >
                  Klar
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ Ängen */}
      <div className="ang-wrap">
        <Sommarang items={items} height={240} />
        <LevandeStjarnor count={22} />
        <div className="ang-caption">
          <Sparkles size={14} />
          <span>
            {unlockedCount > 0
              ? `${unlockedCount} föremål har flyttat in i din trädgård.`
              : 'Slutför uppgifter och se trädgårdens växa.'}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------- Bibliotek */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Belöningsbibliotek</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              {unlockedCount} upplåsta • {nextReward ? `nästa: ${nextReward.name}` : 'slut'}
            </div>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => setShowLibrary((v) => !v)}>
            {showLibrary ? 'Dölj' : 'Visa alla'}
          </button>
        </div>

        {showLibrary ? (
          byTheme.map((group) => (
            <div key={group.theme} style={{ marginTop: 10 }}>
              <div className="card-sub">{THEME_LABEL[group.theme]}</div>
              <div className="reward-grid">
                {group.rewards.map((r) => {
                  const unlocked = unlocks.has(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`reward-tile ${unlocked ? 'unlocked' : ''}`}
                      onClick={() => unlocked && setViewingItem(r.illustration ?? '🎁')}
                      title={
                        unlocked
                          ? r.name
                          : `${r.name} — låses upp vid ${r.xp_required} XP`
                      }
                    >
                      <span className="reward-illu">{r.illustration ?? '🎁'}</span>
                      <span className="reward-name">{r.name}</span>
                      {unlocked ? (
                        <span className="reward-tag">Upplåst</span>
                      ) : (
                        <span className="reward-tag locked">
                          <Lock size={11} /> {r.xp_required} XP
                        </span>
                      )}
                      {r.bonus_xp > 0 && unlocked && (
                        <span className="reward-bonus">+{r.bonus_xp} XP</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="reward-grid" style={{ marginTop: 8 }}>
            {(defs ?? [])
              .slice()
              .sort((a, b) => a.position - b.position)
              .slice(Math.max(0, unlockedCount - 2), Math.max(4, unlockedCount + 4))
              .map((r) => {
                const unlocked = unlocks.has(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`reward-tile ${unlocked ? 'unlocked' : ''}`}
                    onClick={() => unlocked && setViewingItem(r.illustration ?? '🎁')}
                  >
                    <span className="reward-illu">{r.illustration ?? '🎁'}</span>
                    <span className="reward-name">{r.name}</span>
                    {unlocked ? (
                      <span className="reward-tag">Upplåst</span>
                    ) : (
                      <span className="reward-tag locked">
                        <Lock size={11} /> {r.xp_required} XP
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* -------------------------------------------------- Belöningsrutan */}
      <BelonningModal
        reward={celebration?.reward ?? null}
        bonusXp={celebration?.bonusXp ?? 0}
        items={celebration?.items ?? []}
        onClose={closeCelebration}
      />

      {/* ---------------------------------------------------- Föremålsvy */}
      {viewingItem && (
        <div className="reward-overlay" role="dialog" aria-modal="true">
          <div className="reward-backdrop" onClick={() => setViewingItem(null)} />
          <div className="reward-popup small">
            <button
              className="reward-close"
              onClick={() => setViewingItem(null)}
              aria-label="Stäng"
            >
              <X size={18} />
            </button>
            <div className="reward-popup-illu">{viewingItem}</div>
            <p className="reward-popup-desc">Upplockat föremål i din trädgård.</p>
            <button className="btn btn-outline" onClick={() => setViewingItem(null)}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
