import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MessageCenter } from './MessageCenter';
import type { ChatMessage, Conversation, MessageContact, SentConversation } from '../lib/types';

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  listSentConversations: vi.fn(),
  listMessageContacts: vi.fn(),
  listChannelMessages: vi.fn(),
  pendingAttachments: vi.fn(),
  markChannelRead: vi.fn(),
  archiveChannel: vi.fn(),
  sendChannelMessage: vi.fn(),
  openDirectChannel: vi.fn(),
}));

const files = vi.hoisted(() => ({
  uploadAttachment: vi.fn(),
  deletePendingAttachment: vi.fn(),
  openAttachment: vi.fn(),
}));

vi.mock('../lib/api', () => api);

vi.mock('../lib/attachments', () => ({
  ATTACHMENT_ACCEPT: '.pdf',
  attachmentSize: (bytes: number) => `${bytes} B`,
  attachmentUrl: vi.fn(),
  ...files,
}));

vi.mock('../lib/unread', () => ({
  refreshUnread: vi.fn().mockResolvedValue(undefined),
  useUnreadTotal: () => 0,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ identity: { id: 'u1', username: 'elev1', role: 'elev' } }),
}));

vi.mock('../lib/supabase', () => {
  const builder = {
    on: () => builder,
    subscribe: () => ({}),
  };
  return {
    supabase: { channel: () => builder, removeChannel: vi.fn() },
    errorMessage: (error: unknown, fallback = 'Något gick fel.') =>
      error instanceof Error && error.message ? error.message : fallback,
  };
});

const inboxRow: Conversation = {
  channel_id: 'ch1',
  other_id: 'u2',
  other_username: 'lisa',
  other_name: 'Lisa Lärare',
  other_role: 'lärare',
  last_body: 'Hej på dig',
  last_at: '2026-10-20T09:00:00Z',
  last_sender_id: 'u2',
  last_from_me: false,
  unread_count: 2,
  archived: false,
};

const archivedRow: Conversation = {
  ...inboxRow,
  channel_id: 'ch2',
  other_name: 'Olof Speciallärare',
  other_username: 'olof',
  other_role: 'speciallärare',
  last_body: 'Gammalt ärende',
  unread_count: 0,
  archived: true,
};

const sentRow: SentConversation = {
  channel_id: 'ch1',
  other_id: 'u2',
  other_username: 'lisa',
  other_name: 'Lisa Lärare',
  other_role: 'lärare',
  last_sent_body: 'Mitt svar',
  last_sent_at: '2026-10-20T10:00:00Z',
  sent_count: 1,
};

const contact: MessageContact = {
  user_id: 'u2',
  username: 'lisa',
  display_name: 'Lisa Lärare',
  role: 'lärare',
  organisation_name: 'Testskolan',
};

const secondContact: MessageContact = {
  user_id: 'u3',
  username: 'olof',
  display_name: 'Olof Speciallärare',
  role: 'speciallärare',
  organisation_name: 'Testskolan',
};

const thread: ChatMessage[] = [
  {
    id: 'm1',
    sender_id: 'u2',
    sender_username: 'lisa',
    sender_name: 'Lisa Lärare',
    body: 'Hej på dig',
    body_html: '<p>Hej på dig</p>',
    created_at: '2026-10-20T09:00:00Z',
    attachments: [],
  },
];

function openConversation(name: string) {
  const label = screen.getByText(name);
  const row = label.closest('button');
  if (!row) throw new Error(`Hittade ingen konversation med ${name}`);
  fireEvent.click(row);
}

function setup(overrides: Partial<Record<keyof typeof api, unknown>> = {}) {
  api.listConversations.mockResolvedValue([inboxRow, archivedRow]);
  api.listSentConversations.mockResolvedValue([sentRow]);
  api.listMessageContacts.mockResolvedValue([contact]);
  api.listChannelMessages.mockResolvedValue(thread);
  api.pendingAttachments.mockResolvedValue([]);
  api.markChannelRead.mockResolvedValue(undefined);
  api.archiveChannel.mockResolvedValue(undefined);
  api.sendChannelMessage.mockResolvedValue(undefined);
  api.openDirectChannel.mockResolvedValue('ch1');
  for (const [key, value] of Object.entries(overrides)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any)[key].mockResolvedValue(value);
  }
  return render(<MessageCenter />);
}

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom saknar scrollIntoView; meddelandevyn scrollar till sista bubblan.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('MessageCenter – inkorg och oläst', () => {
  it('visar konversationer med olästmarkering från servern', async () => {
    setup();
    expect(await screen.findByText('Lisa Lärare')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('2 olästa')).toBeTruthy();
    expect(screen.queryByText('Olof Speciallärare')).toBeNull();
  });

  it('visar en tom vy med uppmaning när inkorgen är tom', async () => {
    setup({ listConversations: [] });
    expect(await screen.findByText('Inga konversationer ännu')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Nytt meddelande/ }).length).toBeGreaterThan(0);
  });

  it('visar fel och låter användaren försöka igen', async () => {
    api.listConversations.mockRejectedValue(new Error('Kopplingen misslyckades.'));
    api.listSentConversations.mockResolvedValue([]);
    api.listMessageContacts.mockResolvedValue([]);
    render(<MessageCenter />);

    expect(await screen.findByText('Kunde inte hämta meddelandena')).toBeTruthy();
    expect(screen.getByText('Kopplingen misslyckades.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeTruthy();
  });

  it('markerar konversationen som läst när den öppnas från inkorgen', async () => {
    setup();
    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');

    await waitFor(() => expect(api.markChannelRead).toHaveBeenCalledWith('ch1'));
    expect(document.querySelector('.bubble-html')?.textContent).toContain('Hej på dig');
  });
});

describe('MessageCenter – skickat', () => {
  it('har en egen vy för skickade meddelanden', async () => {
    setup();
    fireEvent.click(await screen.findByRole('tab', { name: /Skickat/ }));

    expect(await screen.findByText(/Mitt svar/)).toBeTruthy();
    expect(screen.getByText('1 skickade')).toBeTruthy();
    expect(screen.queryByText('Hej på dig')).toBeNull();
  });

  it('öppnar en skickad konversation utan att ändra lässtatus', async () => {
    setup();
    fireEvent.click(await screen.findByRole('tab', { name: /Skickat/ }));
    await screen.findAllByText('Lisa Lärare');
    openConversation('Lisa Lärare');

    await waitFor(() =>
      expect(document.querySelector('.bubble-html')?.textContent).toContain('Hej på dig'),
    );
    expect(api.markChannelRead).not.toHaveBeenCalled();
  });

  it('visar tom vy när inget skickats', async () => {
    setup({ listSentConversations: [] });
    fireEvent.click(await screen.findByRole('tab', { name: /Skickat/ }));
    expect(await screen.findByText('Inget skickat ännu')).toBeTruthy();
  });
});

describe('MessageCenter – arkivering', () => {
  it('arkiverar en konversation och flyttar den till arkivet', async () => {
    setup();
    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');
    fireEvent.click(await screen.findByRole('button', { name: 'Arkivera' }));

    await waitFor(() => expect(api.archiveChannel).toHaveBeenCalledWith('ch1', true));
    expect(await screen.findByText('Konversationen ligger nu under Arkiverad.')).toBeTruthy();
  });

  it('visar arkiverade konversationer i en egen vy', async () => {
    setup();
    fireEvent.click(await screen.findByRole('tab', { name: /Arkiverat/ }));

    expect(await screen.findByText('Olof Speciallärare')).toBeTruthy();
    expect(screen.queryByText('Lisa Lärare')).toBeNull();
  });

  it('kan återställa en arkiverad konversation till inkorgen', async () => {
    setup();
    fireEvent.click(await screen.findByRole('tab', { name: /Arkiverat/ }));
    await screen.findByText('Olof Speciallärare');
    openConversation('Olof Speciallärare');
    fireEvent.click(await screen.findByRole('button', { name: 'Tillbaka till inkorgen' }));

    await waitFor(() => expect(api.archiveChannel).toHaveBeenCalledWith('ch2', false));
    expect(await screen.findByText('Konversationen är tillbaka i inkorgen.')).toBeTruthy();
  });
});

describe('MessageCenter – bilagor', () => {
  it('laddar upp, visar och tar bort en bilaga före sändning', async () => {
    setup();
    files.uploadAttachment.mockResolvedValue({
      id: 'att1',
      file_name: 'prov.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-10-20T10:00:00Z',
      storage_path: 'u1/prov.pdf',
    });
    files.deletePendingAttachment.mockResolvedValue(undefined);

    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');
    await screen.findByText('Hej på dig');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['innehåll'], 'prov.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('prov.pdf')).toBeTruthy();
    expect(files.uploadAttachment).toHaveBeenCalledWith('ch1', file);

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort prov.pdf' }));
    await waitFor(() => expect(files.deletePendingAttachment).toHaveBeenCalled());
    expect(screen.queryByText('prov.pdf')).toBeNull();
  });

  it('skickar med bilagor och formaterat innehåll', async () => {
    setup();
    files.uploadAttachment.mockResolvedValue({
      id: 'att1',
      file_name: 'prov.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-10-20T10:00:00Z',
      storage_path: 'u1/prov.pdf',
    });

    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');
    await screen.findByText('Hej på dig');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'prov.pdf', { type: 'application/pdf' })] },
    });
    await screen.findByText('prov.pdf');

    const editor = screen.getByRole('textbox', { name: 'Svara' });
    editor.innerHTML = '<p>Här är <strong>provet</strong>.</p>';
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }));

    await waitFor(() =>
      expect(api.sendChannelMessage).toHaveBeenCalledWith('ch1', 'Här är provet.', {
        bodyHtml: '<p>Här är <strong>provet</strong>.</p>',
        attachmentIds: ['att1'],
      }),
    );
  });

  it('visar en nedladdningsbar bilaga i en skickad konversation', async () => {
    setup({
      listChannelMessages: [
        {
          ...thread[0],
          attachments: [
            {
              id: 'att9',
              file_name: 'schema.pdf',
              storage_path: 'u1/schema.pdf',
              mime_type: 'application/pdf',
              size_bytes: 1024,
            },
          ],
        },
      ],
    });

    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');
    fireEvent.click(await screen.findByRole('button', { name: /schema.pdf/ }));

    await waitFor(() => expect(files.openAttachment).toHaveBeenCalledWith('u1/schema.pdf'));
  });
});

describe('MessageCenter – organisation', () => {
  it('visar bara de kontakter servern godkänner i den egna skolan', async () => {
    setup();
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Nytt meddelande/ }))[0],
    );

    expect((await screen.findAllByText('Lisa Lärare')).length).toBeGreaterThan(0);
    expect(api.listMessageContacts).toHaveBeenCalled();
    expect(screen.queryByText(/annan skola/i)).toBeNull();
  });

  it('förklarar när servern inte ger några tillåtna mottagare', async () => {
    setup({ listMessageContacts: [] });
    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Nytt meddelande/ }))[0],
    );

    expect(await screen.findByText('Inga tillgängliga mottagare')).toBeTruthy();
    expect(screen.getByText(/personer i din egen skola/)).toBeTruthy();
  });

  it('kan bifoga en fil redan i ett nytt meddelande', async () => {
    setup();
    files.uploadAttachment.mockResolvedValue({
      id: 'att1',
      file_name: 'prov.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-10-20T10:00:00Z',
      storage_path: 'u1/prov.pdf',
    });

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Nytt meddelande/ }))[0],
    );
    const contact = document.querySelector('.contact-item') as HTMLButtonElement;
    fireEvent.click(contact);

    const input = document.querySelector('#compose-attach') as HTMLInputElement;
    const file = new File(['x'], 'prov.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByText('prov.pdf')).toBeTruthy();
    expect(api.openDirectChannel).toHaveBeenCalledWith('u2');
    expect(files.uploadAttachment).toHaveBeenCalledWith('ch1', file);

    fireEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    await waitFor(() =>
      expect(api.sendChannelMessage).toHaveBeenCalledWith('ch1', '', {
        bodyHtml: undefined,
        attachmentIds: ['att1'],
      }),
    );
  });

  it('städar bort bilagor när mottagaren byts', async () => {
    setup({ listMessageContacts: [contact, secondContact] });
    files.uploadAttachment.mockResolvedValue({
      id: 'att1',
      file_name: 'prov.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-10-20T10:00:00Z',
      storage_path: 'u1/prov.pdf',
    });
    files.deletePendingAttachment.mockResolvedValue(undefined);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Nytt meddelande/ }))[0],
    );
    const contacts = document.querySelectorAll('.contact-item');
    fireEvent.click(contacts[0] as HTMLButtonElement);

    const input = document.querySelector('#compose-attach') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'prov.pdf', { type: 'application/pdf' })] },
    });
    await screen.findByText('prov.pdf');

    fireEvent.click(contacts[1] as HTMLButtonElement);
    await waitFor(() => expect(files.deletePendingAttachment).toHaveBeenCalled());
    expect(screen.queryByText('prov.pdf')).toBeNull();
    expect(api.sendChannelMessage).not.toHaveBeenCalled();
  });

  it('städar bort oskickade bilagor när dialogen avbryts', async () => {
    setup();
    files.uploadAttachment.mockResolvedValue({
      id: 'att1',
      file_name: 'prov.pdf',
      mime_type: 'application/pdf',
      size_bytes: 2048,
      created_at: '2026-10-20T10:00:00Z',
      storage_path: 'u1/prov.pdf',
    });
    files.deletePendingAttachment.mockResolvedValue(undefined);

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /Nytt meddelande/ }))[0],
    );
    fireEvent.click(document.querySelector('.contact-item') as HTMLButtonElement);

    const input = document.querySelector('#compose-attach') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'prov.pdf', { type: 'application/pdf' })] },
    });
    await screen.findByText('prov.pdf');

    fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
    await waitFor(() => expect(files.deletePendingAttachment).toHaveBeenCalled());
    expect(api.sendChannelMessage).not.toHaveBeenCalled();
  });

  it('skickar aldrig ett tomt meddelande', async () => {
    setup();
    await screen.findByText('Lisa Lärare');
    openConversation('Lisa Lärare');
    await screen.findByText('Hej på dig');

    const send = screen.getByRole('button', { name: 'Skicka' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });
});
