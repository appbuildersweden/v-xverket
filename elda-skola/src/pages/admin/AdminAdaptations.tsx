import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  deleteAdminAdaptation,
  listAdminAdaptations,
  listAdminClassMembers,
  saveAdminAdaptation,
} from '../../lib/api';
import type { AdminAdaptation, AdminClassMember, SchoolRole } from '../../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from '../../components/ui';

interface Person {
  id: string;
  username: string;
  role: SchoolRole;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
}

const nameOf = (row: Person) =>
  [row.firstName, row.lastName].filter(Boolean).join(' ') || row.username;

const today = new Date().toISOString().slice(0, 10);

type Filter = 'alla' | 'aktiv' | 'avslutad' | 'folj_upp';

export const AdminAdaptations: React.FC = () => {
  const [rows, setRows] = useState<AdminAdaptation[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [members, setMembers] = useState<AdminClassMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('alla');
  const [form, setForm] = useState<{ open: boolean; row: AdminAdaptation | null }>({
    open: false,
    row: null,
  });
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [adaptations, memberRows, list] = await Promise.all([
        listAdminAdaptations(),
        listAdminClassMembers(),
        supabase.functions.invoke('admin-users', { body: { action: 'list' } }),
      ]);
      setRows(adaptations);
      setMembers(memberRows);
      const accounts = (list.data as { accounts?: Person[] } | null)?.accounts;
      setPeople(Array.isArray(accounts) ? accounts.filter((row) => row.active) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte hämta elevstödet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const students = useMemo(() => people.filter((row) => row.role === 'elev'), [people]);
  const staff = useMemo(
    () => people.filter((row) => row.role === 'lärare' || row.role === 'speciallärare'),
    [people],
  );
  const classFor = useCallback(
    (userId: string) => members.find((row) => row.user_id === userId && row.member_role === 'elev'),
    [members],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('sv');
    return rows
      .filter((row) => {
        if (filter === 'alla') return true;
        if (filter === 'folj_upp') {
          return row.status === 'aktiv' && Boolean(row.follow_up_at) && String(row.follow_up_at) <= today;
        }
        return row.status === filter;
      })
      .filter((row) =>
        !needle
          ? true
          : `${row.student_name} ${row.title} ${row.subject ?? ''} ${row.class_name ?? ''}`
              .toLocaleLowerCase('sv')
              .includes(needle),
      );
  }, [filter, query, rows]);

  const remove = async (row: AdminAdaptation) => {
    if (!window.confirm(`Ta bort anpassningen ”${row.title}” för ${row.student_name}?`)) return;
    setWorking(row.id);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminAdaptation(row.id);
      setNotice('Anpassningen är borttagen.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte ta bort anpassningen.');
    } finally {
      setWorking(null);
    }
  };

  const overdue = rows.filter(
    (row) => row.status === 'aktiv' && row.follow_up_at && String(row.follow_up_at) <= today,
  ).length;

  return (
    <Card
      title="Elevstöd och anpassningar"
      subtitle="Känslig information. Endast behörig personal ser innehållet; elever ser det aldrig."
      action={
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => void refresh()}>
            Uppdatera
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setForm({ open: true, row: null })}>
            Ny anpassning
          </Button>
        </div>
      }
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      {error && (
        <Alert>
          {error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => void refresh()}>
              Försök igen
            </Button>
          </div>
        </Alert>
      )}
      {overdue > 0 && (
        <Alert>
          <ShieldAlert size={16} /> {overdue} aktiv{overdue === 1 ? '' : 'a'} anpassning
          {overdue === 1 ? '' : 'ar'} har en uppföljning som är förfallen eller idag.
        </Alert>
      )}

      <div className="filter-bar">
        <input
          className="input"
          placeholder="Sök elev, rubrik eller klass"
          aria-label="Sök elevstöd"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {(
          [
            ['alla', 'Alla'],
            ['aktiv', 'Aktiva'],
            ['folj_upp', 'Behöver följas upp'],
            ['avslutad', 'Avslutade'],
          ] as Array<[Filter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`chip ${filter === value ? 'chip-active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Hämtar elevstöd…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={rows.length ? 'Inga träffar' : 'Inget elevstöd registrerat'}
          description="Skapa en anpassning för en elev. Den blir läsbar för lärare som undervisar eleven."
        />
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th>Elev</th>
                <th>Anpassning</th>
                <th>Ämne</th>
                <th>Status</th>
                <th>Uppföljning</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.student_name}</strong>
                    <small>{row.class_name || 'Ingen klass'}</small>
                  </td>
                  <td>
                    <strong>{row.title}</strong>
                    <small>{row.measures || row.description || ''}</small>
                  </td>
                  <td>{row.subject || 'Allmänt'}</td>
                  <td>
                    <Badge tone={row.status === 'aktiv' ? 'green' : 'neutral'}>
                      {row.status === 'aktiv' ? 'Aktiv' : 'Avslutad'}
                    </Badge>
                  </td>
                  <td>
                    {row.follow_up_at ? (
                      <span className={String(row.follow_up_at) <= today && row.status === 'aktiv' ? 'small' : 'small muted'}>
                        {new Date(row.follow_up_at).toLocaleDateString('sv-SE')}
                        {row.follow_up_name ? ` · ${row.follow_up_name}` : ''}
                      </span>
                    ) : (
                      <span className="small muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil size={13} />}
                        onClick={() => setForm({ open: true, row })}
                      >
                        Redigera
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={13} />}
                        loading={working === row.id}
                        onClick={() => void remove(row)}
                      >
                        Ta bort
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form.open && (
        <AdaptationForm
          row={form.row}
          students={students}
          staff={staff}
          classFor={classFor}
          onClose={() => setForm({ open: false, row: null })}
          onSaved={async (message) => {
            setForm({ open: false, row: null });
            setNotice(message);
            await refresh();
          }}
        />
      )}
    </Card>
  );
};

const AdaptationForm: React.FC<{
  row: AdminAdaptation | null;
  students: Person[];
  staff: Person[];
  classFor: (userId: string) => AdminClassMember | undefined;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}> = ({ row, students, staff, classFor, onClose, onSaved }) => {
  const [studentId, setStudentId] = useState(row?.student_id ?? '');
  const [classId, setClassId] = useState(row?.class_id ?? '');
  const [subject, setSubject] = useState(row?.subject ?? '');
  const [title, setTitle] = useState(row?.title ?? '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [measures, setMeasures] = useState(row?.measures ?? '');
  const [status, setStatus] = useState<'aktiv' | 'avslutad'>(row?.status ?? 'aktiv');
  const [followUpAt, setFollowUpAt] = useState(row?.follow_up_at ? String(row.follow_up_at).slice(0, 10) : '');
  const [followUpBy, setFollowUpBy] = useState(row?.follow_up_by ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!studentId) {
      setError('Välj en elev.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Ge anpassningen en rubrik (minst 2 tecken).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAdminAdaptation({
        id: row?.id ?? null,
        studentId,
        classId,
        subject,
        title,
        description,
        measures,
        status,
        followUpAt,
        followUpBy,
      });
      await onSaved('Anpassningen är sparad.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte spara anpassningen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      title={row ? 'Redigera anpassning' : 'Ny anpassning'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Spara
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <div className="grid-2">
        <Field label="Elev" htmlFor="ad-student" required>
          <select
            id="ad-student"
            className="input"
            value={studentId}
            onChange={(event) => {
              const next = event.target.value;
              setStudentId(next);
              setClassId(classFor(next)?.class_id ?? '');
            }}
          >
            <option value="">Välj elev</option>
            {students.map((person) => (
              <option key={person.id} value={person.id}>
                {nameOf(person)} · {classFor(person.id)?.class_name ?? 'Ingen klass'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ämne" htmlFor="ad-subject">
          <input
            id="ad-subject"
            className="input"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="T.ex. Matematik"
          />
        </Field>
      </div>
      <Field label="Rubrik" htmlFor="ad-title" required>
        <input
          id="ad-title"
          className="input"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label="Beskrivning" htmlFor="ad-description">
        <textarea
          id="ad-description"
          className="input"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label="Stödinsatser" htmlFor="ad-measures" hint="Skriv bara det som behövs för undervisningen.">
        <textarea
          id="ad-measures"
          className="input"
          rows={4}
          value={measures}
          onChange={(event) => setMeasures(event.target.value)}
        />
      </Field>
      <div className="grid-2">
        <Field label="Uppföljning" htmlFor="ad-follow" hint="Tomt om ingen uppföljning behövs.">
          <input
            id="ad-follow"
            className="input"
            type="date"
            value={followUpAt}
            onChange={(event) => setFollowUpAt(event.target.value)}
          />
        </Field>
        <Field label="Ansvarig" htmlFor="ad-owner">
          <select
            id="ad-owner"
            className="input"
            value={followUpBy}
            onChange={(event) => setFollowUpBy(event.target.value)}
          >
            <option value="">Ingen utsedd</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {nameOf(person)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Status" htmlFor="ad-status">
        <select
          id="ad-status"
          className="input"
          value={status}
          onChange={(event) => setStatus(event.target.value as 'aktiv' | 'avslutad')}
        >
          <option value="aktiv">Aktiv</option>
          <option value="avslutad">Avslutad</option>
        </select>
      </Field>
      <p className="small muted" style={{ marginBottom: 0 }}>
        Endast lärare som undervisar eleven och administratörer kan läsa anpassningen. Eleven ser den aldrig.
      </p>
    </Modal>
  );
};
