import React, { useMemo, useState } from 'react';
import { ArrowUpRight, BellRing, CalendarClock, Newspaper } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import { listPublications } from '../lib/api';
import { hasFormatting, sanitizeHtml } from '../lib/sanitize';
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

  const visible = [groups.viktig, groups.nyhet, groups.uppdatering].filter(
    (rows) => rows.length > 0,
  );

  if (visible.length === 0) {
    return (
      <Card title="Från skolan" subtitle="Nyheter och viktig information för din skola">
        <EmptyState
          icon={<Newspaper size={22} />}
          title="Inget publicerat just nu"
          description="När skolan publicerar nyheter eller viktig information visas den här."
        />
      </Card>
    );
  }

  return (
    <div className="news-grid">
      {groups.viktig.length > 0 && (
        <Section
          icon={<BellRing size={16} />}
          title="Viktig information"
          description="Sådant som skolan markerat som särskilt viktigt."
          rows={groups.viktig}
          onOpen={setActive}
          highlight
        />
      )}
      {groups.nyhet.length > 0 && (
        <Section
          icon={<Newspaper size={16} />}
          title="Nyheter"
          description="Publicerad information från skolan."
          rows={groups.nyhet}
          onOpen={setActive}
        />
      )}
      {groups.uppdatering.length > 0 && (
        <Section
          icon={<CalendarClock size={16} />}
          title="Kommande uppdateringar"
          description="Planerade förändringar och nya funktioner."
          rows={groups.uppdatering}
          onOpen={setActive}
        />
      )}

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
          {active.body && hasFormatting(active.body) ? (
            <div
              className="rich-text-body"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(active.body) }}
            />
          ) : active.body ? (
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
  icon: React.ReactNode;
  title: string;
  description: string;
  rows: Publication[];
  onOpen: (row: Publication) => void;
  highlight?: boolean;
}> = ({ icon, title, description, rows, onOpen, highlight }) => (
  <Card
    title={title}
    subtitle={description}
    action={<span className="news-icon">{icon}</span>}
    className={highlight ? 'news-important' : undefined}
  >
    <div className="list">
      {rows.slice(0, 3).map((row) => (
        <button
          key={row.id}
          type="button"
          className="list-row news-row"
          onClick={() => onOpen(row)}
        >
          <div className="list-main">
            <p className="list-title">{row.title}</p>
            {row.summary && <p className="list-sub">{truncate(row.summary, 110)}</p>}
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
      {rows.length > 3 && (
        <p className="small muted" style={{ margin: '10px 0 0' }}>
          {rows.length - 3} fler i samma kategori.
        </p>
      )}
    </div>
  </Card>
);
