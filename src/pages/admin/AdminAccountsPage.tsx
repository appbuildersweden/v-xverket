import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import type {
  AuthAccount,
  RegistrationApplication,
  RegistrationDecision,
} from '../../lib/auth';
import {
  ACCOUNT_STATUS_LABELS,
  APPLICATION_KIND_LABELS,
  ROLE_LABELS,
  ROLE_OPTIONS,
  accountStatus,
  applicationName,
  displayName,
  formatDate,
  formatDateTime,
  fullName,
  initials,
  type AccountRole,
  type AccountStatusTone,
} from './account-utils';

interface Props {
  onNavigate: (pageId: string) => void;
}

type RoleFilter = 'all' | AccountRole;
type StatusFilter = 'all' | AccountStatusTone;

interface Feedback {
  kind: 'ok' | 'error';
  text: string;
}

const DECISION_LABELS: Record<RegistrationDecision, string> = {
  godkand: 'Godkänn',
  begransad: 'Godkänn med begränsning',
  nekad: 'Avslå',
};

const DECISION_SUCCESS: Record<RegistrationDecision, string> = {
  godkand:
    'Ansökan godkändes. Om ett konto är kopplat har det nu full åtkomst enligt sin roll.',
  begransad:
    'Ansökan godkändes med begränsning. Ett kopplat konto är aktivt men får inte skapa klasser eller ansöka om klassmedlemskap.',
  nekad: 'Ansökan avslogs. Om ett konto är kopplat har det stängts av.',
};

export const AdminAccountsPage: React.FC<Props> = ({ onNavigate }) => {
  const {
    user,
    listAccounts,
    updateAccountProfile,
    setAccountRole,
    setAccountActive,
    setAccountLimited,
    deleteAccount,
    listRegistrationApplications,
    decideRegistrationApplication,
  } = useAuth();

  const [accounts, setAccounts] = useState<AuthAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [applications, setApplications] = useState<RegistrationApplication[] | null>(null);
  const [applicationsError, setApplicationsError] = useState<string | null>(null);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [decisionFor, setDecisionFor] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [applicationBusy, setApplicationBusy] = useState<string | null>(null);
  const [showApplications, setShowApplications] = useState(false);

  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<AccountRole>('elev');
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmLimit, setConfirmLimit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refreshAccounts = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      const result = await listAccounts();
      if (result.ok) {
        setAccounts(result.accounts);
        setAccountsError(null);
      } else {
        setAccountsError(result.error);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [listAccounts],
  );

  const refreshApplications = useCallback(async () => {
    setApplicationsLoading(true);
    const result = await listRegistrationApplications();
    if (result.ok) {
      setApplications(result.applications);
      setApplicationsError(null);
    } else {
      setApplicationsError(result.error);
    }
    setApplicationsLoading(false);
  }, [listRegistrationApplications]);

  useEffect(() => {
    void refreshAccounts();
    void refreshApplications();
  }, [refreshAccounts, refreshApplications]);

  const selected = useMemo(
    () => accounts?.find((account) => account.id === selectedId) ?? null,
    [accounts, selectedId],
  );

  const selectedIdValue = selected?.id ?? null;
  useEffect(() => {
    if (!selectedIdValue) return;
    const account = accounts?.find((item) => item.id === selectedIdValue);
    if (!account) return;
    setFirstName(account.firstName ?? '');
    setLastName(account.lastName ?? '');
    setRole(account.role);
    setConfirmDeactivate(false);
    setConfirmLimit(false);
    setConfirmDelete(false);
    setFeedback(null);
    // Fälten fylls bara när ett annat konto öppnas — inte vid varje omräkning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIdValue]);

  const activeAdmins = useMemo(
    () => (accounts ?? []).filter((account) => account.role === 'admin' && account.active).length,
    [accounts],
  );

  const pendingApplications = useMemo(
    () => (applications ?? []).filter((application) => application.status === 'vantar'),
    [applications],
  );

  const visible = useMemo(() => {
    if (!accounts) return null;
    const q = query.trim().toLowerCase();
    return accounts.filter((account) => {
      if (roleFilter !== 'all' && account.role !== roleFilter) return false;
      if (statusFilter !== 'all' && accountStatus(account).tone !== statusFilter) return false;
      if (!q) return true;
      return [account.username, account.firstName, account.lastName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(q));
    });
  }, [accounts, query, roleFilter, statusFilter]);

  const selectAccount = (account: AuthAccount) => {
    setSelectedId(account.id);
    setDecisionFor(null);
  };

  const isSelf = Boolean(selected && user && selected.id === user.id);
  const selectedIsLastActiveAdmin = Boolean(
    selected && selected.role === 'admin' && selected.active && activeAdmins <= 1,
  );
  const nameChanged = Boolean(
    selected &&
      (firstName.trim() !== (selected.firstName ?? '') ||
        lastName.trim() !== (selected.lastName ?? '')),
  );
  const roleChanged = Boolean(selected && role !== selected.role);
  const roleNeedsWarning = Boolean(
    selected && role !== selected.role && (role === 'admin' || selected.role === 'admin'),
  );

  const saveChanges = async () => {
    if (!selected || saving) return;
    if (!firstName.trim() || !lastName.trim()) {
      setFeedback({ kind: 'error', text: 'Förnamn och efternamn måste fyllas i.' });
      return;
    }
    setSaving(true);
    setFeedback(null);

    if (nameChanged) {
      const result = await updateAccountProfile(
        selected.id,
        firstName.trim(),
        lastName.trim(),
      );
      if (!result.ok) {
        setSaving(false);
        setFeedback({ kind: 'error', text: result.error });
        return;
      }
    }

    if (roleChanged) {
      const result = await setAccountRole(selected.id, role);
      if (!result.ok) {
        setSaving(false);
        setRole(selected.role);
        setFeedback({
          kind: 'error',
          text: `${result.error}${nameChanged ? ' Namnändringen sparades.' : ''}`,
        });
        await refreshAccounts(true);
        return;
      }
    }

    setSaving(false);
    setFeedback({ kind: 'ok', text: 'Ändringarna sparades och gäller direkt.' });
    await refreshAccounts(true);
  };

  const changeActive = async (nextActive: boolean) => {
    if (!selected || statusBusy) return;
    setStatusBusy(true);
    setConfirmDeactivate(false);
    const result = await setAccountActive(selected.id, nextActive);
    setStatusBusy(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', text: result.error });
      return;
    }
    setFeedback({
      kind: 'ok',
      text: nextActive ? 'Kontot är aktiverat.' : 'Kontot är inaktiverat och kan inte logga in.',
    });
    await refreshAccounts(true);
  };

  const changeLimited = async (nextLimited: boolean) => {
    if (!selected || statusBusy) return;
    setStatusBusy(true);
    setConfirmLimit(false);
    const result = await setAccountLimited(selected.id, nextLimited);
    setStatusBusy(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', text: result.error });
      return;
    }
    setFeedback({
      kind: 'ok',
      text: nextLimited
        ? 'Kontot är begränsat. Det kan läsa men inte skapa klasser eller ansöka om klassmedlemskap.'
        : 'Begränsningen är hävd. Kontot har full åtkomst enligt sin roll.',
    });
    await refreshAccounts(true);
  };

  const removeAccount = async () => {
    if (!selected || statusBusy) return;
    const removedUsername = selected.username;
    setStatusBusy(true);
    const result = await deleteAccount(selected.id);
    setStatusBusy(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', text: result.error });
      return;
    }
    setSelectedId(null);
    setConfirmDelete(false);
    setFeedback({
      kind: 'ok',
      text: `Kontot ${removedUsername} raderades permanent.`,
    });
    await refreshAccounts(true);
  };

  const decideApplication = async (
    application: RegistrationApplication,
    decision: RegistrationDecision,
  ) => {
    if (applicationBusy) return;
    setApplicationBusy(application.id);
    setApplicationsError(null);
    const result = await decideRegistrationApplication(
      application.id,
      decision,
      decisionNote,
    );
    setApplicationBusy(null);
    if (!result.ok) {
      setApplicationsError(result.error);
      return;
    }
    setDecisionFor(null);
    setDecisionNote('');
    setFeedback({ kind: 'ok', text: DECISION_SUCCESS[decision] });
    await Promise.all([refreshApplications(), refreshAccounts(true)]);
  };

  const status = selected ? accountStatus(selected) : null;

  return (
    <div className="admin-page">
      <div className="admin-section-head">
        <p className="admin-section-sub">
          Alla konton hämtas från Eldas databas. Roller, status och borttagning
          kontrolleras alltid på servern.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onNavigate('create-user')}
        >
          <UserPlus size={14} /> Skapa konto
        </button>
      </div>

      {feedback && (
        <div
          className={`admin-feedback admin-feedback--${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          {feedback.kind === 'ok' ? <Check size={15} /> : <AlertCircle size={15} />}
          <span>{feedback.text}</span>
          <button
            type="button"
            className="admin-feedback-close"
            aria-label="Stäng meddelandet"
            onClick={() => setFeedback(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* ------------------------------------------------ Ansökningar */}
      <section className="card admin-applications-card" aria-labelledby="pending-heading">
        <div className="card-head">
          <div>
            <div className="card-title" id="pending-heading">
              Väntande registreringar
            </div>
            <div className="card-sub" style={{ marginBottom: 0 }}>
              Granska ansökningar från registreringsflödet. Beslutet uppdaterar
              kontots status direkt.
            </div>
          </div>
          <div className="admin-applications-actions">
            <span className="badge badge-solid">{pendingApplications.length} väntar</span>
            {pendingApplications.length > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setShowApplications((value) => !value)}
                aria-expanded={showApplications}
              >
                {showApplications ? 'Dölj ansökningar' : 'Visa ansökningar'}
              </button>
            )}
          </div>
        </div>

        {applicationsLoading && !applications && (
          <div className="admin-inline-loading" role="status">
            <RefreshCw size={14} className="spin" /> Hämtar ansökningar…
          </div>
        )}

        {applicationsError && (
          <div className="login-err" role="alert" style={{ marginTop: 12 }}>
            <AlertCircle size={15} />
            <span>{applicationsError}</span>
            <button className="view-link" onClick={() => void refreshApplications()}>
              Försök igen
            </button>
          </div>
        )}

        {!applicationsLoading && pendingApplications.length === 0 && !applicationsError && (
          <div className="admin-callout admin-callout--ok" style={{ marginTop: 12 }}>
            <Clock size={16} />
            <div>
              <b>Inga väntande registreringar</b>
              <p>Alla ansökningar är redan hanterade.</p>
            </div>
          </div>
        )}

        {showApplications && pendingApplications.map((application) => {
          const busy = applicationBusy === application.id;
          const open = decisionFor === application.id;
          return (
            <div className="admin-application" key={application.id}>
              <div className="admin-application-main">
                <div className="admin-application-title">
                  <span className="badge">
                    {APPLICATION_KIND_LABELS[application.kind] ?? application.kind}
                  </span>
                  <b>{applicationName(application)}</b>
                  <span className="admin-muted">
                    {formatDateTime(application.createdAt)}
                  </span>
                </div>
                {application.summary && (
                  <p className="admin-application-summary">{application.summary}</p>
                )}
                <div className="admin-application-meta">
                  {application.createdUsername && (
                    <span>Användarnamn: {application.createdUsername}</span>
                  )}
                  {application.botDecision && (
                    <span>Boten: {application.botDecision}</span>
                  )}
                  {application.riskFlags.length > 0 && (
                    <span>Flaggor: {application.riskFlags.join(', ')}</span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setDecisionFor(open ? null : application.id);
                    setDecisionNote('');
                  }}
                  disabled={busy}
                >
                  {open ? 'Stäng granskning' : 'Granska'}
                </button>
              </div>

              {open && (
                <div className="admin-decision">
                  <label className="field" htmlFor={`decision-note-${application.id}`}>
                    <span className="field-label-top">Anteckning till loggen (valfritt)</span>
                    <textarea
                      id={`decision-note-${application.id}`}
                      className="input admin-textarea"
                      value={decisionNote}
                      onChange={(event) => setDecisionNote(event.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="T.ex. verifierad av skolans administration"
                      disabled={busy}
                    />
                  </label>
                  <div className="admin-decision-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void decideApplication(application, 'godkand')}
                      disabled={busy}
                    >
                      {busy ? 'Sparar…' : DECISION_LABELS.godkand}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => void decideApplication(application, 'begransad')}
                      disabled={busy}
                    >
                      {DECISION_LABELS.begransad}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => void decideApplication(application, 'nekad')}
                      disabled={busy}
                    >
                      {DECISION_LABELS.nekad}
                    </button>
                  </div>
                  <p className="admin-muted">
                    Godkänd ger full åtkomst. Begränsad innebär aktivt konto utan
                    klassfunktioner. Avslag stänger av det kopplade kontot.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ------------------------------------------------ Kontolista */}
      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={15} />
          <input
            className="input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök användarnamn eller namn…"
            aria-label="Sök konton"
          />
        </div>
        <select
          className="input admin-select"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
          aria-label="Filtrera på roll"
        >
          <option value="all">Alla roller</option>
          {ROLE_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="input admin-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          aria-label="Filtrera på status"
        >
          <option value="all">Alla statusar</option>
          <option value="active">Aktiva</option>
          <option value="inactive">Inaktiva</option>
          <option value="limited">Begränsade</option>
        </select>
        {(query || roleFilter !== 'all' || statusFilter !== 'all') && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              setQuery('');
              setRoleFilter('all');
              setStatusFilter('all');
            }}
          >
            Rensa filter
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-sm admin-refresh"
          onClick={() => {
            void refreshAccounts(true);
            void refreshApplications();
          }}
          disabled={refreshing}
        >
          <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
          {refreshing ? 'Uppdaterar…' : 'Uppdatera'}
        </button>
      </div>

      <div className="admin-count" role="status">
        {visible
          ? `${visible.length} av ${accounts?.length ?? 0} konton${
              accounts && accounts.length !== visible.length ? ' (filtrerat)' : ''
            }`
          : 'Hämtar konton…'}
      </div>

      {accountsError && (
        <div className="login-err" role="alert" style={{ marginBottom: 14 }}>
          <AlertCircle size={15} />
          <span>{accountsError}</span>
          <button className="view-link" onClick={() => void refreshAccounts()}>
            Försök igen
          </button>
        </div>
      )}

      <div className="admin-accounts-layout">
        <div className="admin-account-list card" aria-busy={loading}>
          {loading && !accounts && (
            <div className="admin-list-loading" role="status">
              {[0, 1, 2, 3].map((row) => (
                <div className="admin-skeleton admin-skeleton-row" key={row}>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
              <span className="admin-muted">Laddar konton…</span>
            </div>
          )}

          {!loading && accounts && accounts.length === 0 && (
            <div className="empty-state" style={{ padding: '36px 16px' }}>
              <UserPlus size={32} />
              <h3>Inga konton ännu</h3>
              <p style={{ fontSize: 13 }}>
                Skapa det första kontot under Skapa konto.
              </p>
            </div>
          )}

          {visible && visible.length === 0 && accounts && accounts.length > 0 && (
            <div className="empty-state" style={{ padding: '36px 16px' }}>
              <Search size={30} />
              <h3>Inga konton matchar</h3>
              <p style={{ fontSize: 13 }}>Prova ett annat namn eller rensa filtren.</p>
            </div>
          )}

          {visible?.map((account) => {
            const accountState = accountStatus(account);
            return (
              <button
                type="button"
                className={`admin-account-row${
                  account.id === selectedId ? ' admin-account-row--selected' : ''
                }`}
                key={account.id}
                onClick={() => selectAccount(account)}
                aria-pressed={account.id === selectedId}
              >
                <span className="avatar-circle">{initials(account)}</span>
                <span className="admin-account-identity">
                  <span className="admin-account-username">{account.username}</span>
                  <span className="admin-account-name">
                    {fullName(account) || 'Namn saknas'}
                    {account.id === user?.id ? ' · du' : ''}
                  </span>
                </span>
                <span className={`badge${account.role === 'admin' ? ' badge-solid' : ''}`}>
                  {ROLE_LABELS[account.role]}
                </span>
                <span className={`admin-status admin-status--${accountState.tone}`}>
                  {accountState.label}
                </span>
                <span className="admin-account-date">{formatDate(account.createdAt)}</span>
                <ChevronRight size={16} className="admin-account-chevron" />
              </button>
            );
          })}
        </div>

        <aside className="admin-detail card" aria-label="Kontouppgifter">
          {!selected && (
            <div className="admin-detail-empty">
              <UserPlus size={30} />
              <h3>Välj ett konto</h3>
              <p>
                Öppna ett konto i listan för att se profil, roll och status samt
                för att redigera eller radera det.
              </p>
            </div>
          )}

          {selected && status && (
            <>
              <div className="admin-detail-head">
                <span className="avatar-circle avatar-circle--lg">{initials(selected)}</span>
                <div>
                  <div className="admin-detail-username">{selected.username}</div>
                  <div className="admin-detail-name">
                    {displayName(selected)}
                    {isSelf ? ' · ditt konto' : ''}
                  </div>
                </div>
              </div>

              <div className="admin-detail-badges">
                <span className="badge">{ROLE_LABELS[selected.role]}</span>
                <span className={`admin-status admin-status--${status.tone}`}>
                  {status.label}
                </span>
                {selected.mustChangePassword && (
                  <span className="badge">Tillfälligt lösenord</span>
                )}
              </div>

              <dl className="admin-meta">
                <div>
                  <dt>Kontotyp</dt>
                  <dd>{selected.accountType === 'privat' ? 'Privat elev' : 'Skolkonto'}</dd>
                </div>
                <div>
                  <dt>Skapat</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{status.detail}</dd>
                </div>
              </dl>

              {isSelf && (
                <div className="admin-callout admin-callout--info">
                  <ShieldAlert size={16} />
                  <div>
                    <b>Det här är ditt eget konto</b>
                    <p>
                      Du kan ändra ditt namn, men inte din egen roll, status eller
                      radera kontot. Det kräver en annan administratör.
                    </p>
                  </div>
                </div>
              )}

              {selectedIsLastActiveAdmin && (
                <div className="admin-callout admin-callout--warning">
                  <ShieldAlert size={16} />
                  <div>
                    <b>Sista aktiva administratören</b>
                    <p>
                      Rollen kan inte ändras, kontot kan inte inaktiveras och det
                      kan inte raderas. Det skyddar åtkomsten till panelen.
                    </p>
                  </div>
                </div>
              )}

              <div className="admin-form">
                <div className="admin-form-row">
                  <label className="field" htmlFor="admin-edit-first">
                    <span className="field-label-top">Förnamn</span>
                    <input
                      id="admin-edit-first"
                      className="input"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      disabled={saving}
                      autoComplete="off"
                      maxLength={80}
                    />
                  </label>
                  <label className="field" htmlFor="admin-edit-last">
                    <span className="field-label-top">Efternamn</span>
                    <input
                      id="admin-edit-last"
                      className="input"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      disabled={saving}
                      autoComplete="off"
                      maxLength={80}
                    />
                  </label>
                </div>

                <label className="field" htmlFor="admin-edit-role">
                  <span className="field-label-top">Roll</span>
                  <select
                    id="admin-edit-role"
                    className="input"
                    value={role}
                    onChange={(event) => setRole(event.target.value as AccountRole)}
                    disabled={saving || isSelf || selectedIsLastActiveAdmin}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {roleNeedsWarning && !isSelf && !selectedIsLastActiveAdmin && (
                  <div className="admin-callout admin-callout--warning">
                    <ShieldAlert size={16} />
                    <div>
                      <b>Rollbytet gäller administratörsbehörighet</b>
                      <p>
                        {role === 'admin'
                          ? 'Administratörer kan hantera alla konton och roller. Ge rollen bara till någon du litar på.'
                          : 'Kontot förlorar administratörsåtkomsten direkt när ändringen sparas.'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="admin-form-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void saveChanges()}
                    disabled={saving || (!nameChanged && !roleChanged)}
                  >
                    {saving ? 'Sparar…' : 'Spara ändringar'}
                  </button>
                  {selected.mustChangePassword && (
                    <span className="admin-muted">
                      Användaren måste byta lösenord vid nästa inloggning.
                    </span>
                  )}
                </div>
              </div>

              <div className="admin-divider" />

              <div className="admin-subsection">
                <h4>Kontostatus</h4>
                <div className="admin-action-row">
                  {selected.active ? (
                    confirmDeactivate ? (
                      <div className="admin-confirm">
                        <p>
                          Kontot stängs av direkt och kan inte logga in förrän det
                          aktiveras igen. Fortsätt?
                        </p>
                        <div className="admin-confirm-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void changeActive(false)}
                            disabled={statusBusy}
                          >
                            {statusBusy ? 'Sparar…' : 'Ja, inaktivera'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setConfirmDeactivate(false)}
                            disabled={statusBusy}
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setConfirmDeactivate(true)}
                        disabled={statusBusy || isSelf || selectedIsLastActiveAdmin}
                        title={
                          isSelf
                            ? 'Du kan inte inaktivera ditt eget konto'
                            : selectedIsLastActiveAdmin
                              ? 'Det måste finnas minst en aktiv administratör'
                              : undefined
                        }
                      >
                        Inaktivera konto
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => void changeActive(true)}
                      disabled={statusBusy}
                    >
                      {statusBusy ? 'Sparar…' : 'Aktivera konto'}
                    </button>
                  )}

                  {selected.limited ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => void changeLimited(false)}
                      disabled={statusBusy}
                    >
                      Häv begränsning
                    </button>
                  ) : confirmLimit ? (
                    <div className="admin-confirm">
                      <p>
                        Kontot kan fortfarande logga in men får inte skapa klasser
                        eller ansöka om klassmedlemskap. Fortsätt?
                      </p>
                      <div className="admin-confirm-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => void changeLimited(true)}
                          disabled={statusBusy}
                        >
                          {statusBusy ? 'Sparar…' : 'Ja, begränsa'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setConfirmLimit(false)}
                          disabled={statusBusy}
                        >
                          Avbryt
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setConfirmLimit(true)}
                      disabled={statusBusy || isSelf}
                      title={isSelf ? 'Du kan inte begränsa ditt eget konto' : undefined}
                    >
                      Begränsa konto
                    </button>
                  )}
                </div>
              </div>

              <div className="admin-divider" />

              <div className="admin-subsection admin-danger-zone">
                <h4>Radera konto</h4>
                {confirmDelete ? (
                  <div className="admin-confirm admin-confirm--danger">
                    <p>
                      <b>Raderingen kan inte ångras.</b> Kontot, profilen och
                      kopplingar som hör till kontot tas bort permanent. Historiska
                      loggposter behålls.
                    </p>
                    <div className="admin-confirm-actions">
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void removeAccount()}
                        disabled={statusBusy}
                      >
                        <Trash2 size={14} />
                        {statusBusy ? 'Raderar…' : `Radera ${selected.username}`}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setConfirmDelete(false)}
                        disabled={statusBusy}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger-outline btn-sm"
                      onClick={() => setConfirmDelete(true)}
                      disabled={statusBusy || isSelf || selectedIsLastActiveAdmin}
                      title={
                        isSelf
                          ? 'Du kan inte radera ditt eget konto'
                          : selectedIsLastActiveAdmin
                            ? 'Det måste finnas minst en aktiv administratör'
                            : undefined
                      }
                    >
                      <Trash2 size={14} /> Radera konto
                    </button>
                    <p className="admin-muted">
                      Kräver bekräftelse. Det sista aktiva administratörskontot
                      kan aldrig raderas.
                    </p>
                  </>
                )}
              </div>

              <p className="admin-detail-footnote">
                Roll- och statusändringar sparas i databasen och gäller vid nästa
                inloggning. Servern nekar alltid ändringar som skulle låsa ute
                den sista administratören.
              </p>
            </>
          )}
        </aside>
      </div>

      <p className="admin-muted" style={{ marginTop: 12 }}>
        Statusar: {ACCOUNT_STATUS_LABELS.active} = full åtkomst,{' '}
        {ACCOUNT_STATUS_LABELS.inactive} = ingen inloggning,{' '}
        {ACCOUNT_STATUS_LABELS.limited} = aktiv men utan klassfunktioner.
      </p>
    </div>
  );
};
