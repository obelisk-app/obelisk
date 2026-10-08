import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { NOSTR_CLIENTS } from '@/services/social/clients';
import Page, { dynamic } from '@/app/[locale]/notes/[id]/page';

const note = vi.hoisted(() => ({ id: 'a'.repeat(64), pubkey: 'b'.repeat(64), kind: 1, created_at: 1700000000, content: 'Public note', tags: [], sig: '' }));
vi.mock('@/services/server/viewer/nostr-fetch', () => ({
  fetchEventForViewer: async () => note,
  fetchAuthorForViewer: async () => null,
  fetchAuthorNotes: async () => [],
  fetchAuthorFollows: async () => [],
  fetchAuthorRelays: async () => ({ read: [], write: [] }),
  fetchProfilesForViewer: async () => [],
  displayNameFor: () => 'Author',
}));
vi.mock('@/components/common/BridgeRoute', () => ({ default: ({ children }: { children: ReactNode }) => <div data-testid="viewer-bridge">{children}</div> }));
vi.mock('@/app/[locale]/notes/[id]/NoteViewerClient', () => ({ default: () => <div data-testid="interactive-note" /> }));

describe('note route composition', () => {
  it('owns its dynamic bridge boundary and preserves native client destinations', async () => {
    render(<LocaleProvider>{await Page({ params: Promise.resolve({ id: note.id }) })}</LocaleProvider>);
    expect(dynamic).toBe('force-dynamic');
    expect(screen.getByTestId('viewer-bridge')).toContainElement(screen.getByTestId('interactive-note'));
    for (const client of NOSTR_CLIENTS) {
      const link = screen.getByTestId(`open-in-${client.id}`);
      expect(link).toHaveAttribute('href', client.event(note.id));
      if (client.isHandler) expect(link).not.toHaveAttribute('target');
      else {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
      }
    }
  });
});
