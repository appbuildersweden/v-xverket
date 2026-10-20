import React, { useMemo, useState } from 'react';
import { MailOpen, Megaphone, Paperclip, PenLine } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import {
  listAdminClasses,
  listAnnouncements,
  listClasses,
  markAnnouncementRead,
} from '../lib/api';
import { attachmentSize, openAttachment } from '../lib/attachments';
import { sanitizeHtml } from '../lib/sanitize';
import { dateTime, truncate } from '../lib/format';
import type { Announcement } from '../lib/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageIntro,
  Spinner,
} from '../components/ui';
import { InformationComposer } from '../components/InformationComposer';
import { SchoolNews } from '../components/SchoolNews';

type Mode = 'elev' | 'larare' | 'speciallarare' | 'admin';

interface Props {
  mode: Mode;
}

const COPY: Record<Mode, { eyebrow: string; description: string }> = {
  elev: {
    eyebrow: 'Elevpanel',
    description: 'Information från dina lärare och från skolan. Olästa ligger överst.',
  },
  larare: {
    eyebrow: 'Lärarpanel',
    description:
      'Information du och skolan har skickat till klasserna. Skriv ny information med formaterad text och bilagor.',
  },
  speciallarare: {
    eyebrow: 'Speciallärarpanel',
    description: 'Information som gäller dina elevers klasser och skolan.',
  },
  admin: {
    eyebrow: 'Administratörspanel',
    description:
      'Skicka information till valfria klasser och se allt som skickats i skolan. Nyheter publiceras under Publiceringar.',
  },
};

/**
 * Informationsflödet – egen sida för alla roller.
 *
 * Sidan visar två saker: information som skickats till klasser (från lärare
 * eller admin) och skolans publicerade nyheter. Lärare och admin skriver ny
 * information med samma composer som meddelandena använder.
 */
export const Information: React.FC<Props> = ({ mode }) => {
  const canPublish = mode === 'larare' || mode === 'admin';
  const [composerOpen, setComposerOpen] = useState(false);
  const [active, setActive] = useState<Announcement | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = useAsync(async () => {
    const classes =
      mode === 'admin'
        ? (await listAdminClasses()).map((row) => ({ id: row.id, name: row.name }))
        : (await listClasses()).map((row) => ({ id: row.id, name: row.name }));
    const rows = await listAnnouncements(classes.map((row) => row.id));
    return { classes, rows };
  }, [mode]);

  const rows = useMemo(
    () => (state.data?.rows ?? []).filter((row) => (onlyUnread ? !row.read_at : true)),
    [state.data, onlyUnread],
  );
  const unread = (state.data?.rows ?? []).filter((row) => !row.read_at).length;
  const classes = state.data?.classes ?? [];

  const open = async (row: Announcement) => {
    setActive(row);
    if (!row.read_at && mode === 'elev') {
      try {
        await markAnnouncementRead(row.id);
        await state.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Kunde inte markera som läst.');
      }
    }
  };

  if (state.loading) return <Spinner label="Hämtar information…" />;
  if (state.error) {
    return (
      <>
        <PageIntro title="Information" />
        <Card>
          <EmptyState
            title="Kunde inte hämta informationen"
            description={state.error}
            action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
          />
        </Card>
      </>
    );
  }

  return (
    <div>
      <PageIntro
        eyebrow={COPY[mode].eyebrow}
        title="Information"
        description={COPY[mode].description}
        actions={
          <>
            {mode === 'elev' && (
              <Button
                variant={onlyUnread ? 'secondary' : 'ghost'}
                icon={<MailOpen size={16} />}
                onClick={() => setOnlyUnread((value) => !value)}
              >
                {onlyUnread ? 'Visa alla' : `Olästa (${unread})`}
              </Button>
            )}
            {canPublish && (
              <Button icon={<PenLine size={16} />} onClick={() => setComposerOpen(true)}>
                Nytt meddelande
              </Button>
            )}
          </>
        }
      />

      {notice && <Alert tone="success">{notice}</Alert>}
      {error && <Alert>{error}</Alert>}

      {composerOpen && (
        <InformationComposer
          classes={classes}
          onClose={() => setComposerOpen(false)}
          onSent={async (count) => {
            setComposerOpen(false);
            setNotice(
              count === 1
                ? 'Informationen är skickad och eleven har fått en avisering.'
                : `Informationen är skickad till ${count} klasser.`,
            );
            await state.reload();
          }}
        />
      )}

      <Card
        title="Information till klasserna"
        subtitle="Nya utskick först. Öppna en rad för att läsa hela texten och bilagorna."
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={24} />}
            title={onlyUnread ? 'Ingen oläst information' : 'Ingen information ännu'}
            description={
              canPublish
                ? 'Skicka din första information med knappen Nytt meddelande.'
                : 'När en lärare eller skolan skickar information till din klass visas den här.'
            }
            action={
              canPublish ? (
                <Button icon={<PenLine size={16} />} onClick={() => setComposerOpen(true)}>
                  Nytt meddelande
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="list">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="list-row info-row"
                onClick={() => void open(row)}
              >
                <div className="list-main">
                  <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                    <span className="list-title">{row.title}</span>
                    {!row.read_at && <Badge tone="green">Ny</Badge>}
                  </div>
                  <p className="list-sub">{truncate(row.body, 160)}</p>
                  <p className="list-sub">
                    {row.class_name ? `${row.class_name} · ` : ''}
                    {row.author_name} · {dateTime(row.created_at)}
                    {row.attachments.length > 0 && ` · ${row.attachments.length} bilaga`}
                  </p>
                </div>
                <div className="list-side">
                  {canPublish && (
                    <Badge tone="blue">
                      {row.recipient_count ?? 0} mottagare · {row.read_count ?? 0} lästa
                    </Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {active && (
        <Modal
          open
          wide
          title={active.title}
          onClose={() => setActive(null)}
          footer={<Button onClick={() => setActive(null)}>Stäng</Button>}
        >
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <Badge tone="green">Information</Badge>
            <span className="small muted">
              {active.class_name ? `${active.class_name} · ` : ''}
              {active.author_name} · {dateTime(active.created_at)}
            </span>
          </div>

          {active.body_html ? (
            <div
              className="rich-text-body"
              // Innehållet är sanerat av sanitizeHtml innan det sparades.
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(active.body_html) }}
            />
          ) : (
            <p style={{ whiteSpace: 'pre-wrap' }}>{active.body}</p>
          )}

          {active.attachments.length > 0 && (
            <div className="attachment-list" style={{ marginTop: 16 }}>
              {active.attachments.map((row) => (
                <button
                  key={row.storage_path}
                  type="button"
                  className="attachment-chip"
                  onClick={() =>
                    void openAttachment(row.storage_path).catch((err) =>
                      setError(err instanceof Error ? err.message : 'Filen kunde inte öppnas.'),
                    )
                  }
                >
                  <Paperclip size={14} aria-hidden />
                  <span>{row.file_name}</span>
                  <span className="small muted">{attachmentSize(row.size_bytes)}</span>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}

      <div style={{ marginTop: 18 }}>
        <SchoolNews />
      </div>
    </div>
  );
};
