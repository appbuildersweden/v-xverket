import React, { useMemo, useState } from 'react';
import { ArrowUpRight, BellRing, CalendarClock, Newspaper } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import { listPublications } from '../lib/api';
import { dateTime, truncate } from '../lib/format';
import type { Publication, PublicationKind } from '../lib/types';
import { Alert, Badge, Button, Card, EmptyState, Modal, Spinner } from './ui';

const KIND_LABEL: Record<PublicationKind, string> = {
  viktig: 'Viktig information',
  nyhet: 'Nyhet',
  uppdatering: 'Kommande uppdatering',
};

const KIND_TONE: Record<PublicationKind, 'amber' | 'green' | 'blue'> = {
  viktig: 'amber',
  nyhet: 'green',
  uppdatering: 'blue',
};

/**
 * Nyheter, viktig information och kommande uppdateringar på startsidan.
 *
 * Allt innehåll kommer från databasen och är redan filtrerat av servern till
 * den egna skolan, rollen och kontot. Finns inget att visa visas en tydlig
 * tomvy – aldrig påhittat innehåll.
 */
export const SchoolNews: React.FC = () => {
  const state = useAsync(listPublications, []);
  const [active, setActive] = useState<Publication | null>(null);

  const groups = useMemo(() => {
    const rows = state.data ?? [];
    return {
      viktig: rows.filter((row) => row.kind === 'viktig'),
      nyhet: rows.filter((row) => row.kind === 'nyhet'),
      uppdatering: rows.filter((row) => row.kind === 'uppdatering'),
    };
  }, [state.data]);

  if (state.loading) return <Spinner label="Hämtar nyheter…" />;
  if (state.error) {
    return (
      <Card>
        <Alert>
          {state.error}
          <div>
            <Button size="sm" variant="ghost" onClick={() => void state.reload()}>
              Försök igen
            </Button>
          </div>
        </Alert>
      </Card>
    );
  }

  return (
    <div className="stack news-stack">
      <Section
        kind="viktig"
        icon={<BellRing size={18} />}
        title="Viktig information"
        description="Sådant som skolan har markerat som särskilt viktigt."
        rows={groups.viktig}
        onOpen={setActive}
        highlight
      />
      <Section
        kind="nyhet"
        icon={<Newspaper size={18} />}
        title="Nyheter"
        description="Publicerad information från skolan."
        rows={groups.nyhet}
        onOpen={setActive}
      />
      <Section
        kind="uppdatering"
        icon={<CalendarClock size={18} />}
        title="Kommande uppdateringar"
        description="Planerade förändringar och nya funktioner."
        rows={groups.uppdatering}
        onOpen={setActive}
      />

      {active && (
        <Modal
          open
          wide
          title={active.title}
          onClose={() => setActive(null)}
          footer={<Button onClick={() => setActive(null)}>Stäng</Button>}
        >
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <Badge tone={KIND_TONE[active.kind]}>{KIND_LABEL[active.kind]}</Badge>
            <span className="small muted">
              {active.author_name} · {dateTime(active.publish_at)}
            </span>
          </div>
          {active.summary && <p className="news-summary">{active.summary}</p>}
          {active.body ? (
            <p style={{ whiteSpace: 'pre-wrap' }}>{active.body}</p>
          ) : (
            <p className="small muted">Ingen längre text är publicerad.</p>
          )}
          {active.link_url && (
            <p style={{ marginBottom: 0 }}>
              <a href={active.link_url} target="_blank" rel="noopener noreferrer">
                {active.link_label || active.link_url}
              </a>
            </p>
          )}
        </Modal>
      )}
    </div>
  );
};

const Section: React.FC<{
  kind: PublicationKind;
  icon: React.ReactNode;
  title: string;
  description: string;
  rows: Publication[];
  onOpen: (row: Publication) => void;
  highlight?: boolean;
}> = ({ kind, icon, title, description, rows, onOpen, highlight }) => (
  <Card
    title={title}
    subtitle={description}
    action={<span className="news-icon">{icon}</span>}
    className={highlight && rows.length > 0 ? 'news-important' : undefined}
  >
    {rows.length === 0 ? (
      <EmptyState
        icon={icon}
        title={
          kind === 'viktig'
            ? 'Ingen viktig information just nu'
            : kind === 'nyhet'
              ? 'Inga nyheter publicerade'
              : 'Inga kommande uppdateringar'
        }
        description="Inget innehåll är publicerat för dig ännu. Det som publiceras för din skola visas här."
      />
    ) : (
      <div className="list">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            className="list-row news-row"
            onClick={() => onOpen(row)}
          >
            <div className="list-main">
              <p className="list-title">{row.title}</p>
              {row.summary && <p className="list-sub">{truncate(row.summary, 160)}</p>}
              <p className="list-sub">
                {row.author_name} · {dateTime(row.publish_at)}
              </p>
            </div>
            <div className="list-side">
              <Badge tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</Badge>
              <ArrowUpRight size={15} className="muted" aria-hidden />
            </div>
          </button>
        ))}
      </div>
    )}
  </Card>
);
