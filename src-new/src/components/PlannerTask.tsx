import React, { useState } from 'react';
import { Pencil, Play, RotateCcw, Star } from 'lucide-react';
import {
  PRIORITY_LABELS,
  PlannerTask,
  TaskFormInput,
  TaskPriority,
  createTask,
  updateTask,
  validateTask,
} from '../lib/planner';
import { dueLabel } from '../lib/dates';
import { Pill } from './ui';
import { ConfirmButton, Modal, SelectField, TextAreaField, TextField } from './forms';

/**
 * Delade delar för planeringsposter. Både elevens och speciallärarens planering
 * använder samma vy och samma formulär — logiken ligger i lib/planner, så det
 * finns bara en implementation av reglerna.
 */

interface ItemProps {
  task: PlannerTask;
  today: string;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Visas när posten hör till en roll som får XP för slutförda poster. */
  showXp?: boolean;
  /** Text på knappen som markerar posten klar. */
  completeLabel?: string;
}

export const PlannerTaskItem: React.FC<ItemProps> = ({
  task,
  today,
  onStart,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  showXp = false,
  completeLabel = 'Markera klar',
}) => (
  <li className="list-item list-item-static">
    <div className="list-item-content">
      <div className="list-item-title">{task.title}</div>
      <div className="list-item-sub">
        {dueLabel(task.due_date, new Date())} · prioritet {PRIORITY_LABELS[task.priority]}
        {task.status === 'pagar' ? ' · pågår' : ''}
        {showXp && task.xp_awarded ? ' · XP utbetald' : ''}
      </div>
      {task.description && <div className="list-item-sub">{task.description}</div>}
    </div>

    {task.status === 'klar' ? (
      <>
        <Pill tone="ok">Klar</Pill>
        <button type="button" className="btn btn-outline btn-sm" onClick={onReopen}>
          <RotateCcw size={15} /> Återuppta
        </button>
      </>
    ) : (
      <>
        {task.due_date && task.due_date < today && <Pill tone="warn">Försenad</Pill>}
        {task.status === 'ej_paborjad' && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onStart}>
            <Play size={15} /> Påbörja
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={onComplete}>
          {showXp ? <Star size={15} /> : null} {completeLabel}
        </button>
      </>
    )}

    <button
      type="button"
      className="icon-btn"
      onClick={onEdit}
      aria-label={`Redigera ${task.title}`}
    >
      <Pencil size={16} />
    </button>
    <ConfirmButton
      label="Ta bort"
      confirmLabel="Ta bort"
      question="Ta bort posten?"
      onConfirm={onDelete}
      className="icon-btn"
    />
  </li>
);

interface FormProps {
  task?: PlannerTask;
  onClose: () => void;
  onSaved: () => void;
}

/** Formulär för att skapa eller redigera en planeringspost. */
export const PlannerTaskFormModal: React.FC<FormProps> = ({ task, onClose, onSaved }) => {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'medel');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: TaskFormInput = { title, description, due_date: dueDate, priority };
    const problem = validateTask(input);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);

    const result = task
      ? await updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          priority,
        })
      : await createTask({ title, description, due_date: dueDate || null, priority });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
  };

  return (
    <Modal
      title={task ? `Redigera: ${task.title}` : 'Ny post'}
      onClose={onClose}
      closeLabel="Stäng formuläret"
    >
      <form className="form" onSubmit={(e) => void submit(e)}>
        <TextField
          label="Rubrik"
          value={title}
          onChange={setTitle}
          placeholder="Vad ska göras?"
          maxLength={200}
          required
        />
        <TextAreaField
          label="Beskrivning"
          value={description}
          onChange={setDescription}
          rows={3}
          placeholder="Detaljer eller anteckningar"
        />
        <TextField label="Datum" type="date" value={dueDate} onChange={setDueDate} />
        <SelectField
          label="Prioritet"
          value={priority}
          onChange={(value) => setPriority(value as TaskPriority)}
          options={[
            { value: 'hog', label: 'Hög' },
            { value: 'medel', label: 'Medel' },
            { value: 'lag', label: 'Låg' },
          ]}
        />

        {error && (
          <p className="field-hint field-hint-error" role="alert" data-testid="planner-error">
            {error}
          </p>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Avbryt
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sparar…' : task ? 'Spara ändringar' : 'Skapa post'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
