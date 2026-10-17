import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { AuthAccount, Role } from '../../lib/auth-types';
import {
  ACCOUNT_TYPE_FILTERS,
  AccountTypeFilter,
  STATUS_FILTERS,
  StatusFilter,
  accountTypeLabel,
  accountsWithRoles,
  countAccounts,
  displayName,
  filterByAccountType,
  filterByStatus,
  searchAccounts,
  sortAccounts,
} from '../../lib/accounts';
import {
  addClassMember,
  listClasses,
  listMembershipsForUser,
  removeClassMember,
} from '../../lib/classes';
import {
  EmptyState,
  ErrorState,
  LoadingState,
  Pill,
  RoleBadge,
  SectionCard,
  StatCard,
  StatusBadge,
  Table,
} from '../../components/ui';
import { AccountActions } from '../../components/AccountActions';

interface Props {
  /** Sidans rubrik och underrubrik. */
  title: string;
  subtitle: string;
  /** Rollerna som listan omfattar. */
  roles: readonly Role[];
  /** När true visas rollbyte i kontouppgifterna. */
  allowRoleChange?: boolean;
  /** Visa kontotyp (skolelev/privat elev) som kolumn och filter. */
  showAccountType?: boolean;
  /** Visa elevens klasskopplingar i kontouppgifterna. */
  showClasses?: boolean;
  /** Sid-id för "skapa konto"-knappen. */
  createPage?: string;
  createLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
  testId: string;
  onNavigate: (pageId: string) => void;
}

/**
 * Kontolistan som används av sidorna Konton, Elever och Personal.
 *
 * All data kommer från den skyddade serverfunktionen `admin-users`. Varje åtgärd
 * (namn, status, roll, lösenord) verifieras på serversidan och listan hämtas om
 * efteråt, så att gränssnittet aldrig visar ett lyckat resultat som inte finns i
 * backend.
 */
export const AdminAccountsView: React.FC<Props> = ({
  title,
  subtitle,
  roles,
  allowRoleChange = false,
  showAccountType = false,
  showClasses = false,
  createPage = 'create-user',
  createLabel = 'Skapa konto',
  emptyTitle,
  emptyDescription,
  testId,
  onNavigate,
}) => {
  const { user, listAccounts } = useAuth();
  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('alla');
  const [accountType, setAccountType] = useState<AccountTypeFilter>('alla');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listAccounts();
    if (result.ok) setAccounts(result.accounts);
    else {
      setAccounts(null);
      setError(result.error);
    }
    setLoading(false);
  }, [listAccounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => (accounts ? accountsWithRoles(accounts, roles) : []), [accounts, roles]);

  const visible = useMemo(() => {
    let list = all;
    list = searchAccounts(list, query);
    list = filterByStatus(list, status);
    if (showAccountType) list = filterByAccountType(list, accountType);
    return sortAccounts(list);
  }, [all, query, status, accountType, showAccountType]);

  const counts = useMemo(() => countAccounts(all), [all]);
  const selected = useMemo(
    () => all.find((account) => account.id === selectedId) ?? null,
    [all, selectedId],
  );

  return (
    <div className="panel-page" data-testid={testId}>
      <SectionCard
        title={title}
        subtitle={subtitle}
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate(createPage)}
          >
            <UserPlus size={16} /> {createLabel}
          </button>
        }
      >
        <div className="grid-4">
          <StatCard label="I listan" value={counts.total} />
          <StatCard label="Aktiva" value={counts.active} hint={`${counts.inactive} inaktiva`} />
          <StatCard label="Elever" value={counts.elev} />
          <StatCard
            label="Personal"
            value={counts.larare + counts.speciallarare + counts.admin}
            hint={`${counts.larare} lärare · ${counts.speciallarare} speciallärare`}
          />
        </div>

        <div className="toolbar">
          <div className="search-field">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              className="input"
              placeholder="Sök på användarnamn eller namn"
              aria-label="Sök på användarnamn eller namn"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="field field-inline">
            <span>Status</span>
            <select
              className="input"
              aria-label="Filtrera på status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              {STATUS_FILTERS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {showAccountType && (
            <label className="field field-inline">
              <span>Elevtyp</span>
              <select
                className="input"
                aria-label="Filtrera på elevtyp"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as AccountTypeFilter)}
              >
                {ACCOUNT_TYPE_FILTERS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {actionError && (
          <div className="state-note state-note-error" role="alert">
            {actionError}
          </div>
        )}

        {loading && <LoadingState label="Hämtar konton…" />}
        {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

        {!loading && !error && all.length === 0 && (
          <EmptyState
            icon={<Users size={22} />}
            title={emptyTitle}
            description={emptyDescription}
            action={
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate(createPage)}
              >
                <UserPlus size={16} /> {createLabel}
              </button>
            }
          />
        )}

        {!loading && !error && all.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={<Search size={22} />}
            title="Inga träffar"
            description="Ingen användare matchar sökningen eller filtret. Prova ett annat användarnamn eller en annan status."
          />
        )}

        {!loading && !error && visible.length > 0 && (
          <Table
            caption={`Visar ${visible.length} av ${all.length}`}
            head={
              <tr>
                <th scope="col">Användarnamn</th>
                <th scope="col">Namn</th>
                <th scope="col">Roll</th>
                {showAccountType && <th scope="col">Elevtyp</th>}
                <th scope="col">Status</th>
                <th scope="col">Skapat</th>
                <th scope="col">
                  <span className="visually-hidden">Åtgärd</span>
                </th>
              </tr>
            }
          >
            {visible.map((account) => (
              <tr key={account.id}>
                <td>
                  <span className="mono">{account.username}</span>
                  {account.id === user?.id && (
                    <>
                      {' '}
                      <Pill tone="info">Du</Pill>
                    </>
                  )}
                </td>
                <td className="muted">{displayName(account) ?? '—'}</td>
                <td>
                  <RoleBadge role={account.role} />
                </td>
                {showAccountType && <td className="muted">{accountTypeLabel(account)}</td>}
                <td>
                  <StatusBadge active={account.active} />
                </td>
                <td className="muted">
                  {account.createdAt
                    ? new Date(account.createdAt).toLocaleDateString('sv-SE')
                    : '—'}
                </td>
                <td className="right">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setActionError(null);
                      setSelectedId(account.id);
                    }}
                  >
                    Hantera
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </SectionCard>

      {selected && (
        <>
          <AccountActions
            account={selected}
            meId={user?.id}
            allowRoleChange={allowRoleChange}
            onClose={() => setSelectedId(null)}
            onChanged={() => {
              setActionError(null);
              void load();
            }}
          />
          {showClasses && (
            <ClassLinksCard
              studentId={selected.id}
              studentUsername={selected.username}
              onError={setActionError}
            />
          )}
        </>
      )}
    </div>
  );
};

interface ClassLinksProps {
  studentId: string;
  studentUsername: string;
  onError: (message: string | null) => void;
}

/**
 * Elevens klasskopplingar. Medlemskapet är det som ger åtkomst till klassens
 * innehåll — kontot i sig ger ingen klass. Allt kontrolleras serversidigt.
 */
const ClassLinksCard: React.FC<ClassLinksProps> = ({ studentId, studentUsername, onError }) => {
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([]);
  const [memberOf, setMemberOf] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [classResult, memberResult] = await Promise.all([
      listClasses(),
      listMembershipsForUser(studentId),
    ]);
    let problem: string | null = null;
    if (classResult.ok) {
      setClasses(classResult.data.map((c) => ({ id: c.id, name: c.name })));
    } else {
      problem = classResult.error;
    }
    if (memberResult.ok) {
      setMemberOf(memberResult.data.map((m) => m.class_id));
    } else if (!problem) {
      problem = memberResult.error;
    }
    setError(problem);
    setLoading(false);
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = async (classId: string) => {
    setBusy(true);
    onError(null);
    const result = await addClassMember(classId, studentId, 'elev');
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPick('');
    await load();
  };

  const leave = async (classId: string) => {
    setBusy(true);
    onError(null);
    const result = await removeClassMember(classId, studentId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
  };

  const mine = classes.filter((c) => memberOf.includes(c.id));
  const others = classes.filter((c) => !memberOf.includes(c.id));

  return (
    <SectionCard
      title="Klasser och grupper"
      subtitle={`Klassmedlemskap för ${studentUsername}`}
      action={
        <button type="button" className="icon-btn" onClick={() => void load()} aria-label="Uppdatera klassmedlemskap">
          <Layers size={16} />
        </button>
      }
    >
      {loading && <LoadingState label="Hämtar klasser…" />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}

      {!loading && !error && classes.length === 0 && (
        <EmptyState
          icon={<Layers size={22} />}
          title="Inga klasser finns"
          description="Skapa en klass under Klasser och elevgrupper. Först då kan en elev kopplas till en klass."
        />
      )}

      {!loading && !error && classes.length > 0 && (
        <>
          {mine.length === 0 ? (
            <p className="card-sub">
              Eleven är inte med i någon klass ännu. Ett medlemskap ger åtkomst
              till klassens innehåll.
            </p>
          ) : (
            <ul className="list">
              {mine.map((c) => (
                <li className="list-item list-item-static" key={c.id}>
                  <div className="list-item-content">
                    <div className="list-item-title">{c.name}</div>
                    <div className="list-item-sub">Elev i klassen</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() => void leave(c.id)}
                  >
                    <X size={15} /> Ta bort ur klassen
                  </button>
                </li>
              ))}
            </ul>
          )}

          {others.length > 0 && (
            <>
              <label className="field field-inline">
                <span>Lägg till i klass</span>
                <select
                  className="input"
                  aria-label="Välj klass"
                  value={pick}
                  disabled={busy}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">Välj klass</option>
                  {others.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !pick}
                  onClick={() => void join(pick)}
                >
                  <Plus size={15} /> Lägg till eleven
                </button>
              </div>
            </>
          )}
        </>
      )}
    </SectionCard>
  );
};
