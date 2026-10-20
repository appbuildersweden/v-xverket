import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Download,
  MessageSquarePlus,
  Paperclip,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useAsync } from '../lib/useAsync';
import {
  archiveChannel,
  listChannelMessages,
  listConversations,
  listMessageContacts,
  listSentConversations,
  markChannelRead,
  openDirectChannel,
  pendingAttachments,
  sendChannelMessage,
} from '../lib/api';
import {
  ATTACHMENT_ACCEPT,
  attachmentSize,
  deletePendingAttachment,
  openAttachment,
  uploadAttachment,
} from '../lib/attachments';
import { sanitizeHtml, htmlToText } from '../lib/sanitize';
import { refreshUnread } from '../lib/unread';
import { supabase } from '../lib/supabase';
import { dateTime, displayName, truncate } from '../lib/format';
import type {
  ChatMessage,
  Conversation,
  MessageContact,
  PendingAttachment,
  SentConversation,
} from '../lib/types';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Field, Modal, Spinner } from './ui';
import { RichTextEditor } from './RichTextEditor';

const ROLE_LABEL: Record<string, string> = {
  elev: 'Elev',
  lärare: 'Lärare',
  speciallärare: 'Speciallärare',
  admin: 'Systemadministratör',
  okand: 'Okänd roll',
};

type Tab = 'inkorg' | 'skickat' | 'arkiverat';

const TAB_LABEL: Record<Tab, string> = {
  inkorg: 'Inkorg',
  skickat: 'Skickat',
  arkiverat: 'Arkiverat',
};

interface ActiveConversation {
  channelId: string;
  name: string;
  username: string;
  role: string;
  archived: boolean;
}

interface Props {
  title?: string;
  subtitle?: string;
}

/**
 * Det gemensamma meddelandesystemet.
 *
 * Samma komponent används av elev-, lärar- och speciallärarpanelen. Allt som
 * visas kommer från servern: mottagarlistan är begränsad till den egna
 * skolorganisationen och tillåten relation, och servern nekar varje försök att
 * läsa, skriva eller hämta en bilaga i en kanal användaren inte har åtkomst till.
 */
export const MessageCenter: React.FC<Props> = ({
  title = 'Meddelanden',
  subtitle = 'Interna meddelanden inom din skola. Inga meddelanden lämnar skolorganisationen.',
}) => {
  const { identity } = useAuth();
  const myId = identity?.id ?? null;
  const state = useAsync(async () => {
    const [conversations, sent, contacts] = await Promise.all([
      listConversations(),
      listSentConversations(),
      listMessageContacts(),
    ]);
    return { conversations, sent, contacts };
  }, []);

  const [tab, setTab] = useState<Tab>('inkorg');
  const [active, setActive] = useState<ActiveConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [replyHtml, setReplyHtml] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const conversations = state.data?.conversations ?? [];
  const sent = state.data?.sent ?? [];
  const contacts = state.data?.contacts ?? [];

  const inbox = conversations.filter((row) => !row.archived);
  const archived = conversations.filter((row) => row.archived);
  const unread = conversations.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);

  const loadThread = useCallback(async (channelId: string) => {
    setLoadingThread(true);
    setThreadError(null);
    try {
      const [rows, drafts] = await Promise.all([
        listChannelMessages(channelId),
        pendingAttachments(channelId).catch(() => [] as PendingAttachment[]),
      ]);
      setMessages(rows);
      setPending(drafts);
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Kunde inte hämta konversationen.');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const openConversation = useCallback(
    async (row: { channel_id: string; other_name: string; other_username: string; other_role: string; archived?: boolean }, markRead: boolean) => {
      setActive({
        channelId: row.channel_id,
        name: row.other_name,
        username: row.other_username,
        role: row.other_role,
        archived: Boolean(row.archived),
      });
      setMessages(null);
      setReplyHtml('');
      setNotice(null);
      await loadThread(row.channel_id);
      if (markRead) {
        await markChannelRead(row.channel_id).catch(() => undefined);
        await Promise.all([state.reload(), refreshUnread()]);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadThread],
  );

  // Realtid i den öppna konversationen: nya meddelanden och lässtatus.
  useEffect(() => {
    if (!active) return;
    const channel = supabase
      .channel(`elda-thread-${active.channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `channel_id=eq.${active.channelId}`,
        },
        () => {
          void loadThread(active.channelId);
          void state.reload();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reads' },
        () => void state.reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.channelId, loadThread]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const send = async () => {
    if (!active) return;
    const plain = htmlToText(replyHtml);
    if (!plain && pending.length === 0) return;
    setSending(true);
    setThreadError(null);
    try {
      await sendChannelMessage(active.channelId, plain, {
        bodyHtml: replyHtml || undefined,
        attachmentIds: pending.map((row) => row.id),
      });
      setReplyHtml('');
      setPending([]);
      const rows = await listChannelMessages(active.channelId);
      setMessages(rows);
      await Promise.all([state.reload(), refreshUnread()]);
      bottom.current?.scrollIntoView({ block: 'end' });
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Meddelandet kunde inte skickas.');
    } finally {
      setSending(false);
    }
  };

  const attach = async (files: FileList | null) => {
    if (!active || !files || files.length === 0) return;
    setUploading(true);
    setThreadError(null);
    try {
      for (const file of Array.from(files)) {
        const row = await uploadAttachment(active.channelId, file);
        setPending((current) => [...current, row]);
      }
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Filen kunde inte laddas upp.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePending = async (row: PendingAttachment) => {
    setThreadError(null);
    try {
      await deletePendingAttachment(row);
      setPending((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Bilagan kunde inte tas bort.');
    }
  };

  const toggleArchive = async (archivedNow: boolean) => {
    if (!active) return;
    setThreadError(null);
    try {
      await archiveChannel(active.channelId, archivedNow);
      setNotice(
        archivedNow
          ? 'Konversationen ligger nu under Arkiverad.'
          : 'Konversationen är tillbaka i inkorgen.',
      );
      setActive({ ...active, archived: archivedNow });
      setTab(archivedNow ? 'arkiverat' : 'inkorg');
      await state.reload();
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : 'Kunde inte ändra arkiveringen.');
    }
  };

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const match = (name: string, username: string, body: string | null) =>
      !text || `${name} ${username} ${body ?? ''}`.toLowerCase().includes(text);

    return {
      inkorg: inbox.filter((row) => match(row.other_name, row.other_username, row.last_body)),
      skickat: sent.filter((row) => match(row.other_name, row.other_username, row.last_sent_body)),
      arkiverat: archived.filter((row) => match(row.other_name, row.other_username, row.last_body)),
    };
  }, [inbox, sent, archived, query]);

  if (state.loading) return <Spinner label="Hämtar meddelanden…" />;

  if (state.error) {
    return (
      <Card>
        <EmptyState
          title="Kunde inte hämta meddelandena"
          description={state.error}
          action={<Button onClick={() => void state.reload()}>Försök igen</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="message-center">
      <Card
        title={title}
        subtitle={subtitle}
        action={
          <div className="row" style={{ gap: 8 }}>
            {unread > 0 && <Badge tone="amber">{unread} olästa</Badge>}
            <Button
              size="sm"
              icon={<MessageSquarePlus size={15} />}
              onClick={() => setComposeOpen(true)}
            >
              Nytt meddelande
            </Button>
          </div>
        }
      >
        <div className="message-tabs" role="tablist" aria-label="Meddelandevyer">
          {(Object.keys(TAB_LABEL) as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`message-tab ${tab === value ? 'is-active' : ''}`}
              onClick={() => setTab(value)}
            >
              {TAB_LABEL[value]}
              <span className="message-tab-count">{filtered[value].length}</span>
            </button>
          ))}
        </div>

        <div className="search-field" style={{ margin: '10px 0' }}>
          <Search size={16} aria-hidden />
          <input
            className="input"
            placeholder="Sök i dina konversationer"
            aria-label="Sök i dina konversationer"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {notice && <Alert tone="success">{notice}</Alert>}

        {filtered[tab].length === 0 ? (
          <EmptyState
            title={emptyTitle(tab, Boolean(query))}
            description={emptyDescription(tab, Boolean(query))}
            action={
              !query && tab === 'inkorg' ? (
                <Button onClick={() => setComposeOpen(true)} icon={<MessageSquarePlus size={15} />}>
                  Nytt meddelande
                </Button>
              ) : undefined
            }
          />
        ) : tab === 'skickat' ? (
          <div className="conversation-list" role="list">
            {filtered.skickat.map((row) => (
              <SentRow
                key={row.channel_id}
                row={row}
                onOpen={() =>
                  void openConversation(
                    {
                      channel_id: row.channel_id,
                      other_name: row.other_name,
                      other_username: row.other_username,
                      other_role: row.other_role,
                    },
                    false,
                  )
                }
              />
            ))}
          </div>
        ) : (
          <div className="conversation-list" role="list">
            {filtered[tab].map((row) => (
              <ConversationRow
                key={row.channel_id}
                row={row}
                onOpen={() => void openConversation(row, tab === 'inkorg')}
              />
            ))}
          </div>
        )}
      </Card>

      {active && (
        <Card
          title={active.name}
          subtitle={`${ROLE_LABEL[active.role] ?? active.role} · @${active.username}`}
          action={
            <div className="row" style={{ gap: 6 }}>
              <Button
                size="sm"
                variant="ghost"
                icon={active.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                onClick={() => void toggleArchive(!active.archived)}
              >
                {active.archived ? 'Tillbaka till inkorgen' : 'Arkivera'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<ArrowLeft size={15} />}
                onClick={() => setActive(null)}
              >
                Tillbaka
              </Button>
            </div>
          }
        >
          {threadError && <Alert>{threadError}</Alert>}
          {loadingThread && messages === null ? (
            <Spinner label="Hämtar konversationen…" />
          ) : (messages ?? []).length === 0 ? (
            <EmptyState
              title="Ingen konversation ännu"
              description="Skriv det första meddelandet nedan. Du kan formatera texten och bifoga filer."
            />
          ) : (
            <div className="thread" aria-live="polite">
              {(messages ?? []).map((row) => (
                <MessageBubble key={row.id} row={row} mine={row.sender_id === myId} />
              ))}
              <div ref={bottom} />
            </div>
          )}

          <RichTextEditor
            id={`reply-${active.channelId}`}
            label="Svara"
            hint="Formatering och bilagor skickas bara till personer i din skola."
            placeholder="Skriv ett svar…"
            minHeight={110}
            value={replyHtml}
            onChange={setReplyHtml}
          />

          {pending.length > 0 && (
            <div className="attachment-list">
              {pending.map((row) => (
                <span key={row.id} className="attachment-chip">
                  <Paperclip size={14} aria-hidden />
                  <span>{row.file_name}</span>
                  <span className="small muted">{attachmentSize(row.size_bytes)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Ta bort ${row.file_name}`}
                    onClick={() => void removePending(row)}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="row-between" style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                id={`attach-${active.channelId}`}
                onChange={(event) => void attach(event.target.files)}
              />
              <Button
                size="sm"
                variant="ghost"
                icon={<Paperclip size={15} />}
                loading={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Bifoga fil
              </Button>
              <span className="small muted">PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG · max 10 MB</span>
            </div>
            <Button
              icon={<Send size={15} />}
              loading={sending}
              disabled={!htmlToText(replyHtml) && pending.length === 0}
              onClick={() => void send()}
            >
              Skicka
            </Button>
          </div>
        </Card>
      )}

      {composeOpen && (
        <Composer
          contacts={contacts}
          onClose={() => setComposeOpen(false)}
          onStarted={async (starter) => {
            setComposeOpen(false);
            setTab('inkorg');
            await state.reload();
            setActive({
              channelId: starter.channelId,
              name: starter.name,
              username: starter.username,
              role: starter.role,
              archived: false,
            });
            await loadThread(starter.channelId);
          }}
        />
      )}
    </div>
  );
};

const ConversationRow: React.FC<{ row: Conversation; onOpen: () => void }> = ({ row, onOpen }) => (
  <button type="button" role="listitem" className="conversation-item" onClick={onOpen}>
    <Avatar name={row.other_name} size={36} />
    <span className="conversation-main">
      <span className="conversation-head">
        <strong>{row.other_name}</strong>
        <span className="small muted">{dateTime(row.last_at)}</span>
      </span>
      <span className="conversation-sub">
        {ROLE_LABEL[row.other_role] ?? row.other_role} · @{row.other_username}
      </span>
      <span className="conversation-preview">
        {row.last_from_me ? 'Du: ' : ''}
        {row.last_body ? truncate(row.last_body, 90) : 'Inga meddelanden ännu'}
      </span>
    </span>
    {row.unread_count > 0 && <Badge tone="green">{row.unread_count}</Badge>}
  </button>
);

const SentRow: React.FC<{ row: SentConversation; onOpen: () => void }> = ({ row, onOpen }) => (
  <button type="button" role="listitem" className="conversation-item" onClick={onOpen}>
    <Avatar name={row.other_name} size={36} />
    <span className="conversation-main">
      <span className="conversation-head">
        <strong>{row.other_name}</strong>
        <span className="small muted">{dateTime(row.last_sent_at)}</span>
      </span>
      <span className="conversation-sub">
        Till {ROLE_LABEL[row.other_role] ?? row.other_role} · @{row.other_username}
      </span>
      <span className="conversation-preview">
        Du: {row.last_sent_body ? truncate(row.last_sent_body, 90) : '(bilaga)'}
      </span>
    </span>
    <Badge tone="neutral">{row.sent_count} skickade</Badge>
  </button>
);

const MessageBubble: React.FC<{ row: ChatMessage; mine: boolean }> = ({ row, mine }) => (
  <div className={`bubble-row ${mine ? 'mine' : ''}`}>
    <div className="bubble">
      {row.body_html ? (
        <div
          className="bubble-html"
          // Innehållet är sanerat i redigeraren, igen vid visning och kontrollerat av servern.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(row.body_html) }}
        />
      ) : (
        <p>{row.body}</p>
      )}
      {row.attachments?.length > 0 && (
        <div className="attachment-list" style={{ marginTop: 6 }}>
          {row.attachments.map((file) => (
            <button
              key={file.id}
              type="button"
              className="attachment-chip is-link"
              onClick={() => void openAttachment(file.storage_path)}
            >
              <Download size={14} aria-hidden />
              <span>{file.file_name}</span>
              <span className="small muted">{attachmentSize(file.size_bytes)}</span>
            </button>
          ))}
        </div>
      )}
      <span className="bubble-meta">
        {row.sender_name || row.sender_username} · {dateTime(row.created_at)}
      </span>
    </div>
  </div>
);

/** Nytt meddelande: välj en tillåten mottagare och skriv det första inlägget. */
const Composer: React.FC<{
  contacts: MessageContact[];
  onClose: () => void;
  onStarted: (starter: {
    channelId: string;
    name: string;
    username: string;
    role: string;
  }) => Promise<void>;
}> = ({ contacts, onClose, onStarted }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<MessageContact | null>(null);
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kanalen skapas först när den behövs – vid första bilagan eller när
  // meddelandet skickas – så att ett avbrutet utkast inte lämnar tomma
  // konversationer i inkorgen.
  const [channelId, setChannelId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return contacts;
    return contacts.filter((row) =>
      `${row.display_name} ${row.username} ${ROLE_LABEL[row.role] ?? row.role}`
        .toLowerCase()
        .includes(text),
    );
  }, [contacts, query]);

  /**
   * Väljer mottagare. Byter användaren mottagare städas oskickade bilagor
   * bort, så att en fil aldrig råkar skickas till fel person.
   */
  const choose = async (contact: MessageContact) => {
    if (selected?.user_id === contact.user_id) return;
    if (pending.length > 0) {
      for (const row of pending) {
        await deletePendingAttachment(row).catch(() => undefined);
      }
      setPending([]);
    }
    setChannelId(null);
    setSelected(contact);
    setError(null);
  };

  const attach = async (fileList: FileList | null) => {
    if (!selected) {
      setError('Välj en mottagare först.');
      return;
    }
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const target = channelId ?? (await openDirectChannel(selected.user_id));
      setChannelId(target);
      for (const file of Array.from(fileList)) {
        const row = await uploadAttachment(target, file);
        setPending((current) => [...current, row]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Filen kunde inte laddas upp.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const removePending = async (row: PendingAttachment) => {
    setError(null);
    try {
      await deletePendingAttachment(row);
      setPending((current) => current.filter((item) => item.id !== row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bilagan kunde inte tas bort.');
    }
  };

  const start = async () => {
    if (!selected) {
      setError('Välj en mottagare.');
      return;
    }
    const plain = htmlToText(html);
    if (!plain && pending.length === 0) {
      setError('Skriv ett meddelande eller bifoga en fil.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const targetChannel = channelId ?? (await openDirectChannel(selected.user_id));
      await sendChannelMessage(targetChannel, plain, {
        bodyHtml: html || undefined,
        attachmentIds: pending.map((row) => row.id),
      });
      await refreshUnread();
      await onStarted({
        channelId: targetChannel,
        name: displayName({
          first_name: selected.display_name.split(' ')[0] ?? null,
          last_name: selected.display_name.split(' ').slice(1).join(' ') || null,
          username: selected.username,
        }),
        username: selected.username,
        role: selected.role,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Konversationen kunde inte startas.');
    } finally {
      setBusy(false);
    }
  };

  /** Avbryt städar bort oskickade bilagor innan dialogen stängs. */
  const cancel = async () => {
    for (const row of pending) {
      await deletePendingAttachment(row).catch(() => undefined);
    }
    onClose();
  };

  return (
    <Modal
      open
      wide
      title="Nytt meddelande"
      onClose={() => void cancel()}
      footer={
        <>
          <Button variant="ghost" onClick={() => void cancel()}>
            Avbryt
          </Button>
          <Button icon={<Send size={15} />} loading={busy} onClick={() => void start()}>
            Skicka
          </Button>
        </>
      }
    >
      {error && <Alert>{error}</Alert>}
      {contacts.length === 0 ? (
        <EmptyState
          title="Inga tillgängliga mottagare"
          description="Du kan bara skriva till personer i din egen skola som du har behörighet att kontakta. Kontakta systemadministratören om din skolkoppling saknas."
        />
      ) : (
        <>
          <Field
            label="Mottagare"
            htmlFor="compose-search"
            hint="Sök bland de kontakter du får kontakta."
          >
            <input
              id="compose-search"
              className="input"
              placeholder="Sök namn eller användarnamn"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </Field>
          <div className="contact-list" role="list">
            {filtered.length === 0 ? (
              <p className="small muted">Inga träffar.</p>
            ) : (
              filtered.map((row) => (
                <button
                  key={row.user_id}
                  type="button"
                  role="listitem"
                  className={`contact-item ${selected?.user_id === row.user_id ? 'is-active' : ''}`}
                  onClick={() => void choose(row)}
                  aria-pressed={selected?.user_id === row.user_id}
                >
                  <Avatar name={row.display_name} size={30} />
                  <span>
                    <strong>{row.display_name}</strong>
                    <span className="small muted">
                      {' '}
                      · {ROLE_LABEL[row.role] ?? row.role} · @{row.username}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <RichTextEditor
            id="compose-body"
            label="Meddelande"
            placeholder="Skriv ditt meddelande…"
            value={html}
            onChange={setHtml}
          />

          {pending.length > 0 && (
            <div className="attachment-list">
              {pending.map((row) => (
                <span key={row.id} className="attachment-chip">
                  <Paperclip size={14} aria-hidden />
                  <span>{row.file_name}</span>
                  <span className="small muted">{attachmentSize(row.size_bytes)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Ta bort ${row.file_name}`}
                    onClick={() => void removePending(row)}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              id="compose-attach"
              onChange={(event) => void attach(event.target.files)}
            />
            <Button
              size="sm"
              variant="ghost"
              icon={<Paperclip size={15} />}
              loading={uploading}
              disabled={!selected}
              onClick={() => fileInput.current?.click()}
            >
              Bifoga fil
            </Button>
            <span className="small muted">PDF, DOCX, XLSX, PPTX, TXT, PNG, JPG · max 10 MB</span>
          </div>
        </>
      )}
    </Modal>
  );
};

function emptyTitle(tab: Tab, searching: boolean): string {
  if (searching) return 'Inga träffar';
  if (tab === 'skickat') return 'Inget skickat ännu';
  if (tab === 'arkiverat') return 'Inget arkiverat';
  return 'Inga konversationer ännu';
}

function emptyDescription(tab: Tab, searching: boolean): string {
  if (searching) return 'Prova ett annat sökord.';
  if (tab === 'skickat') {
    return 'Meddelanden du skickar visas här med mottagare och antal skickade meddelanden.';
  }
  if (tab === 'arkiverat') {
    return 'Konversationer du arkiverar ligger kvar här med sin historik. Ett nytt meddelande tar tillbaka konversationen till inkorgen.';
  }
  return 'Börja ett nytt meddelande till en lärare, speciallärare eller elev du har behörighet att kontakta.';
}
