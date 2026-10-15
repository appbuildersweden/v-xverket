import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Check,
  Trash2,
  Pencil,
  Calendar,
  AlertCircle,
  RotateCcw,
  Filter,
} from 'lucide-react';
import {
  createTask,
  deleteTask,
  fetchTasks,
  updateTask,
  completeTask,
  reopenTask,
  type PlannerTask,
  type TaskPriority,
  type TaskStatus,
  type UnlockCelebration,
} from '../lib/rewards';

/**
 * Speciallärarens planering och att göra-lista.
 * Allt sparas i Supabase (tabellen spec_tasks) och överlever inloggning/omstart.
 */

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  lag: 'Låg',
  medel: 'Medel',
  hog: 'Hög',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  ej_paborjad: 'Ej påbörjad',
  pagar: 'Pågående',
  klar: 'Klar',
};

type FilterKey = 'alla' | 'idag' | 'kommande' | 'forsenade' | 'klara';

interface Props {
  /** Anropas med nyligen upplåsta belöningar från en slutförd uppgift. */
  onUnlocked?: (unlocks: UnlockCelebration[], xpAwarded: number) => void;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function isOverdue(t: PlannerTask): boolean {
  if (!t.due_date || t.status === 'klar') return false;
  return new Date(`${t.due_date}T23:59:59`) < new Date();
}

function isToday(t: PlannerTask): boolean {
  if (!t.due_date) return false;
  const d = new Date(`${t.due_date}T00:00:00`);
  return d >= startOfToday() && d <= endOfToday();
}

function isUpcoming(t: PlannerTask): boolean {
  if (!t.due_date || t.status === 'klar') return false;
  return new Date(`${t.due_date}T23:59:59`) > endOfToday();
}

const emptyDraft = {
  title: '',
  description: '',
  notes: '',
  due_date: '',
  priority: 'medel' as TaskPriority,
  category: '',
};

export const Planeringspanel: React.FC<Props> = ({ onUnlocked }) => {
  const [tasks, setTasks] = useState<PlannerTask[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('alla');
  const [sort, setSort] = useState<'datum' | 'prioritet'>('datum');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlannerTask | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTasks(await fetchTasks());
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Kunde inte hämta uppgifterna. Kontrollera att migrationen är körd.',
      );
      setTasks((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setShowForm(true);
  };

  const openEdit = (t: PlannerTask) => {
    setEditing(t);
    setDraft({
      title: t.title,
      description: t.description ?? '',
      notes: t.notes ?? '',
      due_date: t.due_date ?? '',
      priority: t.priority,
      category: t.category,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!draft.title.trim()) {
      setError('Ange en titel.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateTask(editing.id, {
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          notes: draft.notes.trim() || null,
          due_date: draft.due_date || null,
          priority: draft.priority,
          category: draft.category.trim() || 'arbetsomrade',
        });
      } else {
        await createTask({
          title: draft.title,
          description: draft.description,
          notes: draft.notes,
          due_date: draft.due_date || null,
          priority: draft.priority,
          category: draft.category,
        });
      }
      setShowForm(false);
      setEditing(null);
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara.');
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (t: PlannerTask) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (t.status === 'klar') {
        await reopenTask(t.id);
      } else {
        const result = await completeTask(t.id);
        if (result.unlocks.length > 0 || result.xpAwarded > 0) {
          onUnlocked?.(result.unlocks, result.xpAwarded);
        }
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte uppdatera.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (t: PlannerTask, status: TaskStatus) => {
    if (busy || t.status === status) return;
    setBusy(true);
    try {
      if (status === 'klar') {
        const result = await completeTask(t.id);
        if (result.unlocks.length > 0 || result.xpAwarded > 0) {
          onUnlocked?.(result.unlocks, result.xpAwarded);
        }
      } else {
        await updateTask(t.id, { status, completed_at: null });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte uppdatera.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (t: PlannerTask) => {
    if (busy) return;
    if (!window.confirm(`Ta bort "${t.title}"?`)) return;
    setBusy(true);
    try {
      await deleteTask(t.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort.');
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const list = tasks ?? [];
    return {
      idag: list.filter((t) => isToday(t) && t.status !== 'klar').length,
      kommande: list.filter(isUpcoming).length,
      forsenade: list.filter(isOverdue).length,
      klara: list.filter((t) => t.status === 'klar').length,
      kvar: list.filter((t) => t.status !== 'klar').length,
      totalt: list.length,
    };
  }, [tasks]);

  const visible = useMemo(() => {
    const list = tasks ?? [];
    const prio = { hog: 0, medel: 1, lag: 2 };
    let out = list.filter((t) => {
      switch (filter) {
        case 'idag':
          return isToday(t) && t.status !== 'klar';
        case 'kommande':
          return isUpcoming(t);
        case 'forsenade':
          return isOverdue(t);
        case 'klara':
          return t.status === 'klar';
        default:
          return true;
      }
    });
    out = out.slice().sort((a, b) => {
      if (sort === 'prioritet') {
        const d = prio[a.priority] - prio[b.priority];
        if (d !== 0) return d;
      }
      const ad = a.due_date ?? '9999-12-31';
      const bd = b.due_date ?? '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
    return out;
  }, [tasks, filter, sort]);

  const filters: Array<{ key: FilterKey; label: string }> = [
    { key: 'alla', label: `Alla (${counts.totalt})` },
    { key: 'idag', label: `Idag (${counts.idag})` },
    { key: 'kommande', label: `Kommande (${counts.kommande})` },
    { key: 'forsenade', label: `Försenade (${counts.forsenade})` },
    { key: 'klara', label: `Klara (${counts.klara})` },
  ];

  const donePct = counts.totalt === 0 ? 0 : Math.round((counts.klara / counts.totalt) * 100);

  return (
    <div>
      {/* ------------------------------------------------------------ Översikt */}
      <div className="grid-3">
        <div className="stat-card">
          <div>
            <div className="lbl">Dagens planering</div>
            <div className="val">{counts.idag}</div>
            <div className="det">uppgifter idag</div>
          </div>
          <div className="stat-icon"><Calendar size={18} /></div>
        </div>
        <div className="stat-card">
          <div>
            <div className="lbl">Kvar att göra</div>
            <div className="val">{counts.kvar}</div>
            <div className="det">av {counts.totalt} totalt</div>
          </div>
          <div className="stat-icon"><Check size={18} /></div>
        </div>
        <div className="stat-card">
          <div>
            <div className="lbl">Försenade</div>
            <div className="val">{counts.forsenade}</div>
            <div className="det">behöver uppmärksamhet</div>
          </div>
          <div className="stat-icon"><AlertCircle size={18} /></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="progress-row">
          <span>Arbetsframsteg</span>
          <b>{counts.klara} av {counts.totalt} klara</b>
        </div>
        <div className="progress" style={{ marginBottom: 0 }}>
          <div className="progress-fill" style={{ width: `${donePct}%` }} />
        </div>
      </div>

      {/* ----------------------------------------------------------- Uppgifter */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Min planering och att göra</div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              Skapa, redigera och följ upp dina egna uppgifter
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Plus size={14} /> Ny uppgift
          </button>
        </div>

        {error && (
          <div className="login-err" role="alert" style={{ marginTop: 10 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Formulär */}
        {showForm && (
          <form className="reward-form" onSubmit={submit}>
            <div className="field">
              <label htmlFor="t-title">Titel *</label>
              <input
                id="t-title"
                className="input"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="T.ex. Förbered lässtrategilektion"
                disabled={busy}
              />
            </div>
            <div className="grid-2" style={{ marginBottom: 0 }}>
              <div className="field">
                <label htmlFor="t-desc">Beskrivning</label>
                <textarea
                  id="t-desc"
                  className="input"
                  rows={2}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Vad ska göras?"
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label htmlFor="t-notes">Anteckningar</label>
                <textarea
                  id="t-notes"
                  className="input"
                  rows={2}
                  value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Fritextanteckningar"
                  disabled={busy}
                />
              </div>
            </div>
            <div className="grid-3" style={{ marginBottom: 0 }}>
              <div className="field">
                <label htmlFor="t-due">Förfallodatum</label>
                <input
                  id="t-due"
                  className="input"
                  type="date"
                  value={draft.due_date}
                  onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))}
                  disabled={busy}
                />
              </div>
              <div className="field">
                <label htmlFor="t-prio">Prioritet</label>
                <select
                  id="t-prio"
                  className="input"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, priority: e.target.value as TaskPriority }))
                  }
                  disabled={busy}
                >
                  <option value="lag">Låg</option>
                  <option value="medel">Medel</option>
                  <option value="hog">Hög</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="t-cat">Kategori</label>
                <input
                  id="t-cat"
                  className="input"
                  value={draft.category}
                  onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                  placeholder="T.ex. Elev A, Matte, Arbetsområde"
                  disabled={busy}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="submit" className="btn btn-primary" disabled={busy || !draft.title.trim()}>
                {busy ? 'Sparar…' : editing ? 'Spara ändringar' : 'Skapa uppgift'}
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                disabled={busy}
              >
                Avbryt
              </button>
            </div>
          </form>
        )}

        {/* Filter */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 4px' }}>
          <Filter size={14} style={{ color: 'var(--text-3)' }} />
          {filters.map((f) => (
            <button
              key={f.key}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <button
            className="btn btn-sm btn-outline"
            style={{ marginLeft: 'auto' }}
            onClick={() => setSort((s) => (s === 'datum' ? 'prioritet' : 'datum'))}
          >
            Sortera: {sort === 'datum' ? 'Datum' : 'Prioritet'}
          </button>
        </div>

        {/* Lista */}
        {tasks === null && !error && (
          <div className="card-sub" style={{ marginTop: 10 }}>Laddar uppgifter…</div>
        )}

        {tasks !== null && visible.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 16px' }}>
            <Calendar size={40} />
            <h3>Inga uppgifter här</h3>
            <p style={{ fontSize: 12.5 }}>
              {filter === 'alla'
                ? 'Skapa din första uppgift med knappen ovan.'
                : 'Byt filter eller lägg till en ny uppgift.'}
            </p>
          </div>
        )}

        {visible.map((t) => {
          const overdue = isOverdue(t);
          const today = isToday(t);
          return (
            <div className={`list-item task-row ${t.status === 'klar' ? 'done' : ''}`} key={t.id}>
              <button
                className={`task-check ${t.status === 'klar' ? 'checked' : ''}`}
                onClick={() => void toggleStatus(t)}
                disabled={busy}
                aria-label={t.status === 'klar' ? 'Återöppna uppgift' : 'Markera som klar'}
                title={t.status === 'klar' ? 'Återöppna' : 'Markera klar (+XP)'}
              >
                {t.status === 'klar' && <Check size={14} />}
              </button>

              <div
                className="list-item-content"
                onClick={() => setExpanded((v) => (v === t.id ? null : t.id))}
                style={{ cursor: 'pointer' }}
              >
                <div className="list-item-title">{t.title}</div>
                <div className="list-item-sub">
                  {t.category}
                  {t.due_date ? ` • Förfaller ${t.due_date}` : ' • Inget datum'}
                  {' • '}
                  {STATUS_LABEL[t.status]}
                  {t.xp_awarded ? ' • XP given' : ''}
                </div>

                {expanded === t.id && (
                  <div className="task-detail">
                    {t.description && <p>{t.description}</p>}
                    {t.notes && <p className="muted">Anteckning: {t.notes}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {(['ej_paborjad', 'pagar', 'klar'] as TaskStatus[]).map((s) => (
                        <button
                          key={s}
                          className={`btn btn-sm ${t.status === s ? 'btn-primary' : 'btn-outline'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void setStatus(t, s);
                          }}
                          disabled={busy}
                        >
                          {STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <span
                className={`badge ${
                  overdue ? 'badge-solid' : t.priority === 'hog' ? 'badge-solid' : ''
                }`}
                title={PRIORITY_LABEL[t.priority]}
              >
                {overdue ? 'Försenad' : today ? 'Idag' : PRIORITY_LABEL[t.priority]}
              </span>

              <button
                className="btn btn-outline btn-sm"
                onClick={() => openEdit(t)}
                disabled={busy}
                title="Redigera"
              >
                <Pencil size={13} />
              </button>
              {t.status === 'klar' && !t.xp_awarded && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => void toggleStatus(t)}
                  disabled={busy}
                  title="Återöppna"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                onClick={() => void remove(t)}
                disabled={busy}
                title="Ta bort"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
          Uppgifterna sparas i Supabase och är bara synliga för dig. Att markera en
          uppgift som klar ger XP — men bara en gång per uppgift.
        </p>
      </div>
    </div>
  );
};
