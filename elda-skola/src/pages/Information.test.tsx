import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Announcement } from '../lib/types';

const listAdminClasses = vi.fn();
const listAnnouncements = vi.fn();
const listClasses = vi.fn();
const listPublications = vi.fn();
const markAnnouncementRead = vi.fn();
const sendInformation = vi.fn();

vi.mock('../lib/api', () => ({
  listAdminClasses: (...args: unknown[]) => listAdminClasses(...args),
  listAnnouncements: (...args: unknown[]) => listAnnouncements(...args),
  listClasses: (...args: unknown[]) => listClasses(...args),
  listPublications: (...args: unknown[]) => listPublications(...args),
  markAnnouncementRead: (...args: unknown[]) => markAnnouncementRead(...args),
  sendInformation: (...args: unknown[]) => sendInformation(...args),
}));

vi.mock('../lib/attachments', () => ({
  ATTACHMENT_ACCEPT: '.pdf',
  attachmentSize: () => '1 kB',
  openAttachment: vi.fn(),
  removeInformationAttachment: vi.fn(),
  uploadInformationAttachment: vi.fn(),
}));

import { Information } from './Information';

const announcement: Announcement = {
  id: 'info-1',
  class_id: 'klass-1',
  class_name: '7A Samhällskunskap',
  author_id: 'user-1',
  author_name: 'Anna Andersson',
  title: 'Utflykt på fredag',
  body: 'Vi samlas 08:15 vid bussen.',
  body_html: '<p>Vi samlas <strong>08:15</strong> vid bussen.</p>',
  attachments: [],
  created_at: '2026-10-19T08:00:00Z',
  read_at: null,
  read_count: 3,
  recipient_count: 20,
};

describe('Information', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listClasses.mockResolvedValue([{ id: 'klass-1', name: '7A Samhällskunskap' }]);
    listAdminClasses.mockResolvedValue([{ id: 'klass-1', name: '7A Samhällskunskap' }]);
    listAnnouncements.mockResolvedValue([announcement]);
    listPublications.mockResolvedValue([]);
    markAnnouncementRead.mockResolvedValue(undefined);
    sendInformation.mockResolvedValue(1);
  });

  it('visar informationen med klass, avsändare och lässtatus för läraren', async () => {
    render(<Information mode="larare" />);
    expect(await screen.findByText('Utflykt på fredag')).toBeTruthy();
    expect(screen.getByText(/7A Samhällskunskap · Anna Andersson/)).toBeTruthy();
    expect(screen.getByText(/20 mottagare · 3 lästa/)).toBeTruthy();
  });

  it('öppnar samma composer som meddelandena med mottagare och grön skicka-knapp', async () => {
    render(<Information mode="larare" />);
    await screen.findByText('Utflykt på fredag');
    fireEvent.click(screen.getAllByRole('button', { name: /Nytt meddelande/ })[0]);
    expect(await screen.findByLabelText(/Mottagare/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Skicka/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bifoga fil/ })).toBeTruthy();
  });

  it('skickar information till vald klass med formaterad text', async () => {
    render(<Information mode="larare" />);
    await screen.findByText('Utflykt på fredag');
    fireEvent.click(screen.getAllByRole('button', { name: /Nytt meddelande/ })[0]);
    await screen.findByLabelText(/Mottagare/);
    const recipientList = document.querySelector('.contact-list') as HTMLElement;
    // Enda klassen är förvald, så eleven/läraren slipper välja om.
    const recipientButton = recipientList.querySelector('button') as HTMLButtonElement;
    expect(recipientButton.getAttribute('aria-pressed')).toBe('true');
    const titleInput = document.querySelector('#info-title') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Ny information' } });
    const editor = document.querySelector('.rte-content') as HTMLElement;
    editor.innerHTML = '<p>Kom ihåg idrottskläder.</p>';
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole('button', { name: /Skicka/ }));

    await waitFor(() => expect(sendInformation).toHaveBeenCalledTimes(1));
    const payload = sendInformation.mock.calls[0][0] as {
      title: string;
      body: string;
      bodyHtml: string;
      classIds: string[];
    };
    expect(payload.title).toBe('Ny information');
    expect(payload.body).toContain('Kom ihåg idrottskläder.');
    expect(payload.bodyHtml).toContain('Kom ihåg');
    expect(payload.classIds).toEqual(['klass-1']);
  });

  it('låter eleven läsa men inte skicka information', async () => {
    render(<Information mode="elev" />);
    fireEvent.click(await screen.findByText('Utflykt på fredag'));
    await waitFor(() => expect(markAnnouncementRead).toHaveBeenCalledWith('info-1'));
    expect(screen.getAllByRole('button', { name: /Stäng/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Nytt meddelande/ })).toBeNull();
  });
});
