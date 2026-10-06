import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';

const groups = vi.hoisted(() => ({ list: [] as JsGroup[] }));
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ useGroups: () => groups.list });
});

import ForwardMessageModal from '@/components/chat/ForwardMessageModal';

const group = (id: string, name: string, kind?: JsGroup['kind']) => ({ id, name, kind } as unknown as JsGroup);

describe('ForwardMessageModal search', () => {
  it('names the search field and filters the target channels', () => {
    groups.list = [group('from', 'origin'), group('a', 'general'), group('b', 'random'), group('v', 'voice room', 'voice')];
    render(
      <LocaleProvider initialLocale="en">
        <ForwardMessageModal message={{ content: 'hi' } as JsMessage} authorName="Ana" fromGroupId="from" onClose={() => {}} />
      </LocaleProvider>,
    );
    const search = screen.getByRole('textbox', { name: 'Search channels' });
    expect(search).toBe(screen.getByTestId('forward-search'));
    expect(screen.queryByTestId('forward-target-from')).toBeNull();
    expect(screen.queryByTestId('forward-target-v')).toBeNull();
    fireEvent.change(search, { target: { value: 'gen' } });
    expect(screen.getByTestId('forward-target-a')).toBeInTheDocument();
    expect(screen.queryByTestId('forward-target-b')).toBeNull();
  });
});
