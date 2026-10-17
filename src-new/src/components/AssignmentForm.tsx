import React, { useState } from 'react';
import { Paperclip } from 'lucide-react';
import {
  AssignedTask,
  NewAssignmentInput,
  createAssignedTask,
  updateAssignedTask,
  validateAssignment,
} from '../lib/assignments';
import { DocumentRow, documentKindLabel, formatBytes, listDocuments, updateDocument } from '../lib/documents';
import { useAsync } from '../lib/useAsync';
import { FormActions, SelectField, TextAreaField, TextField } from './forms';
import { LoadingState } from './ui';

interface TargetOption {
  id: string;
  username: string;
}

interface Props {
  /** Förvald elev (när formuläret öppnas från en elevprofil). */
  studentId?: string | null;
  /** Förvald klass (när formuläret öppnas från en klass). */
  classId?: string | null;
  students?: readonly TargetOption[];
  classes?: ReadonlyArray<{ id: string; name: string }>;
  /** Befintlig uppgift — då redigeras den i stället för att skapas. */
  task?: AssignedTask;
  onSaved: (task: AssignedTask) => void;
  onCancel: () => void;
}

/**
 * Formulär för att skapa en uppgift. Servern kontrollerar att användaren är
 * personal och att uppgiften tilldelas en elev eller en klass — formuläret
 * validerar bara så att felet syns direkt.
 *
 * Eget material kan kopplas till uppgiften: dokumentet får då uppgiftens id, och
 * eleven ser filen i uppgiften. Kopplingen sparas efter att uppgiften har sparats
 * (en ny uppgift har inget id förrän dess), och ändrar aldrig vem som får läsa
 * filen.
 */
export const AssignmentForm: React.FC<Props> = ({
  studentId = null,
  classId = null,
  students = [],
  classes = [],
  task,
  onSaved,
  onCancel,
}) => {
  const editing = !!task;
  const [target, setTarget] = useState(
    studentId ? `elev:${studentId}` : classId ? `klass:${classId}` : '',
  );
  const [title, setTitle] = useState(task?.title ?? '');
  const [subject, setSubject] = useState(task?.subject ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [instructions, setInstructions] = useState(task?.instructions ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Materialet är personalens egna uppladdningar. Fram till att användaren
  // ändrar något visas de dokument som redan hör till uppgiften.
  const material = useAsync(() => listDocuments({ mineOnly: true }));
  const [chosen, setChosen] = useState<string[] | null>(null);
  const documentRows = material.data ?? [];
  const linked = documentRows.filter((row) => task && row.task_id === task.id).map((row) => row.id);
  const selected = chosen ?? linked;

  const toggleMaterial = (id: string) => {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
    setChosen(next);
  };

  /**
   * Kopplar och lossar dokument efter att uppgiften sparats. Ett fel här betyder
   * att uppgiften finns kvar men att kopplingen inte gick igenom — det visas
   * tydligt i stället för att tigas bort.
   */
  const applyMaterial = async (taskId: string): Promise<string | null> => {
    if (chosen === null) return null;
    const changes = documentRows.filter((row) => {
      const shouldLink = selected.includes(row.id);
      const isLinked = row.task_id === taskId;
      return shouldLink !== isLinked;
    });
    for (const row of changes) {
      const shouldLink = selected.includes(row.id);
      const result = await updateDocument(row.id, { taskId: shouldLink ? taskId : null });
      if (!result.ok) return result.error;
    }
    return null;
  };

  const targetOptions: Array<{ value: string; label: string }> = [
    ...students.map((s) => ({ value: `elev:${s.id}`, label: `Elev: ${s.username}` })),
    ...classes.map((c) => ({ value: `klass:${c.id}`, label: `Klass: ${c.name}` })),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    let targetStudent: string | null = null;
    let targetClass: string | null = null;
    if (target.startsWith('elev:')) targetStudent = target.slice(5);
    else if (target.startsWith('klass:')) targetClass = target.slice(6);

    // Vid redigering ligger målet fast — uppgiften flyttas inte mellan elever.
    if (task) {
      targetStudent = task.student_id;
      targetClass = task.class_id;
    }

    const input: NewAssignmentInput = {
      title,
      description,
      instructions,
      subject,
      due_date: dueDate,
      student_id: targetStudent,
      class_id: targetClass,
    };

    const problem = validateAssignment(input);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);

    if (task) {
      const result = await updateAssignedTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        subject: subject.trim(),
        due_date: dueDate || null,
      });
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
      const linkProblem = await applyMaterial(task.id);
      setBusy(false);
      if (linkProblem) {
        setError(`Uppgiften sparades, men materialet kunde inte kopplas: ${linkProblem}`);
        return;
      }
      onSaved({
        ...task,
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        subject: subject.trim(),
        due_date: dueDate || null,
      });
      return;
    }

    const result = await createAssignedTask(input);
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    const linkProblem = await applyMaterial(result.data.id);
    setBusy(false);
    if (linkProblem) {
      setError(`Uppgiften skapades, men materialet kunde inte kopplas: ${linkProblem}`);
      return;
    }
    onSaved(result.data);
  };

  return (
    <form className="form" onSubmit={(e) => void submit(e)} data-testid="assignment-form">
      {!editing && targetOptions.length > 0 && !studentId && !classId && (
        <SelectField
          label="Till"
          value={target}
          onChange={setTarget}
          options={[{ value: '', label: 'Välj elev eller klass' }, ...targetOptions]}
          hint="Uppgiften visas för eleven, eller för alla elever i klassen."
        />
      )}

      <TextField
        label="Rubrik"
        value={title}
        onChange={setTitle}
        placeholder="T.ex. Träna multiplikationstabellen"
        maxLength={200}
        required
      />

      <TextField
        label="Ämne"
        value={subject}
        onChange={setSubject}
        placeholder="T.ex. Matematik"
        hint="Används för att gruppera uppgifter per ämne."
      />

      <TextAreaField
        label="Beskrivning"
        value={description}
        onChange={setDescription}
        placeholder="Kort om vad uppgiften går ut på"
        rows={2}
      />

      <TextAreaField
        label="Instruktioner"
        value={instructions}
        onChange={setInstructions}
        placeholder="Steg för steg hur eleven ska göra"
        rows={4}
      />

      <TextField
        label="Förfallodatum"
        type="date"
        value={dueDate}
        onChange={setDueDate}
        hint="Lämna tomt om uppgiften inte har någon deadline."
      />

      {material.loading && <LoadingState label="Hämtar ditt material…" />}

      {!material.loading && documentRows.length > 0 && (
        <div className="field">
          <span className="field-label">Material till uppgiften</span>
          <div className="chip-row" role="group" aria-label="Material till uppgiften">
            {documentRows.map((row: DocumentRow) => {
              const active = selected.includes(row.id);
              return (
                <button
                  key={row.id}
                  type="button"
                  className={`chip ${active ? 'chip-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleMaterial(row.id)}
                  disabled={busy}
                >
                  <Paperclip size={13} aria-hidden="true" /> {row.title} ·{' '}
                  {documentKindLabel(row)}, {formatBytes(row.size_bytes)}
                </button>
              );
            })}
          </div>
          <p className="field-hint">
            Välj filer som hör till uppgiften — eleven ser dem i uppgiften. Nya filer
            laddas upp under Undervisningsmaterial.
          </p>
        </div>
      )}

      {!material.loading && documentRows.length === 0 && (
        <p className="field-hint">
          Inget eget material att koppla ännu. Ladda upp filer under
          Undervisningsmaterial och koppla dem sedan här.
        </p>
      )}

      {error && (
        <p className="field-hint field-hint-error" role="alert" data-testid="assignment-error">
          {error}
        </p>
      )}

      <FormActions
        busy={busy}
        submitLabel={editing ? 'Spara ändringar' : 'Skapa uppgift'}
        onCancel={onCancel}
      />
    </form>
  );
};
