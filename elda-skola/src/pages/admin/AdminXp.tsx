import React, { useEffect, useState } from 'react';
import { Coins, Minus, Plus, Search, TrendingUp } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { adminGrantXp, adminXpOverview, type XpAccount } from '../../lib/shop';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  PageIntro,
  Spinner,
  Stat,
} from '../../components/ui';

const ROLE_LABEL: Record<string, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Administratör',
};

const PRESETS = [10, 25, 50, 100];

/**
 * Systemadministratörens XP-verktyg.
 *
 * Ändringen skrivs som en vanlig XP-transaktion på servern
 * (`admin_grant_xp`), med anledning i historiken. Saldot kan aldrig bli
 * negativt och beloppet kontrolleras i databasen – formuläret här är bara
 * genvägen dit.
 */
export const AdminXp: React.FC = () => {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [editing, setEditing] = useState<XpAccount | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const state = useAsync(() => adminXpOverview(debounced), [debounced]);
  const accounts = state.data ?? [];
  const totalXp = accounts.reduce((sum, row) => sum + row.total_xp, 0);
  const top = accounts[0];

  if (state.loading && accounts.length === 0) return <Spinner label="Hämtar XP-saldon…" />;

  return (
    <div className="stack">
      <PageIntro
        eyebrow="Belöningar"
        title="XP och belöningar"
        description="Ge eller dra XP för ett konto. Ändringen sparas i kontots XP-historik med anledningen du skriver, och butiken ser det nya saldot direkt."
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="grid-3">
        <Stat label="Konton" value={accounts.length} hint="I urvalet nedan" />
        <Stat label="XP totalt" value={`${totalXp} XP`} hint="Summerat för urvalet" tone="green" />
        <Stat
          label="Högsta saldo"
          value={top ? `${top.total_xp} XP` : '–'}
          hint={top ? top.display_name : 'Inga konton'}
        />
      </div>

      <Card
        title="Konton och saldon"
        subtitle="Sök på namn eller användarnamn. Nivån räknas om direkt när saldot ändras."
        action={
          <div className="search-field" style={{ maxWidth: 320 }}>
            <Search size={16} aria-hidden />
            <input
              className="input"
              placeholder="Sök konto"
              aria-label="Sök konto"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        }
      >
        {state.error ? (
          <EmptyState
            title="Kunde inte hämta saldona"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={<Coins size={22} />}
            title="Inga konton matchar"
            description="Prova ett annat sökord."
          />
        ) : (
          <div className="list">
            {accounts.map((row) => (
              <div key={row.user_id} className="list-row">
                <div className="list-main">
                  <p className="list-title">
                    {row.display_name}{' '}
                    {!row.active && <Badge tone="red">Inaktiv</Badge>}{' '}
                    <Badge tone="neutral">{ROLE_LABEL[row.role] ?? row.role}</Badge>
                  </p>
                  <p className="list-sub">@{row.username}</p>
                </div>
                <div className="xp-row-figures">
                  <strong>{row.total_xp} XP</strong>
                  <span>Nivå {row.level}</span>
                </div>
                <Button
                  size="sm"
                  icon={<TrendingUp size={14} />}
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    setEditing(row);
                  }}
                >
                  Justera XP
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="notice">
        <Coins size={17} />
        <span>
          XP kan bara ändras härifrån och från godkända uppgifter. Elever kan inte skriva XP själva,
          och ett avdrag som är större än saldot avvisas.
        </span>
      </div>

      {editing && (
        <XpForm
          account={editing}
          onClose={() => setEditing(null)}
          onSaved={async (result) => {
            setEditing(null);
            setNotice(
              `${editing.display_name} har nu ${result.total_xp} XP (nivå ${result.level}).`,
            );
            await state.reload();
          }}
        />
      )}
    </div>
  );
};

const XpForm: React.FC<{
  account: XpAccount;
  onClose: () => void;
  onSaved: (result: { total_xp: number; level: number }) => Promise<void>;
}> = ({ account, onClose, onSaved }) => {
  const [amount, setAmount] = useState('50');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount.replace(',', '.')) || 0;
  const next = account.total_xp + value;

  const submit = async (sign: 1 | -1 = 1) => {
    const signed = Math.abs(value) * sign;
    if (!Number.isFinite(signed) || signed === 0) {
      setError('Ange ett XP-belopp som inte är noll.');
      return;
    }
    if (reason.trim().length < 3) {
      setError('Skriv en kort anledning – den sparas i historiken.');
      return;
    }
    if (account.total_xp + signed < 0) {
      setError(`Avdraget är större än saldot (${account.total_xp} XP).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await adminGrantXp({ userId: account.user_id, amount: signed, reason });
      await onSaved(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'XP kunde inte ändras.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={`Justera XP – ${account.display_name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            variant="ghost"
            icon={<Minus size={15} />}
            loading={busy}
            disabled={next < 0}
            onClick={() => void submit(-1)}
          >
            Dra XP
          </Button>
          <Button icon={<Plus size={15} />} loading={busy} onClick={() => void submit(1)}>
            Ge XP
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      <p className="small muted">
        @{account.username} · {account.total_xp} XP · nivå {account.level}
      </p>

      <Field label="Belopp (XP)" htmlFor="xp-amount" required>
        <input
          id="xp-amount"
          className="input"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^0-9-]/g, ''))}
        />
      </Field>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`chip ${Number(amount) === preset ? 'chip-active' : ''}`}
            onClick={() => setAmount(String(preset))}
          >
            {preset} XP
          </button>
        ))}
      </div>

      <Field
        label="Anledning"
        htmlFor="xp-reason"
        hint="Sparas i kontots XP-historik, t.ex. ”Belöning för veckans insats”."
        required
      >
        <input
          id="xp-reason"
          className="input"
          maxLength={120}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <p className="small">
        Nytt saldo efter ändringen: <strong>{next} XP</strong>
        {next < 0 ? ' – avdraget är för stort.' : ''}
      </p>
    </Modal>
  );
};
