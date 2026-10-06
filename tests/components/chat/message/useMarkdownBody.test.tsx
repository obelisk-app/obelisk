import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useGroupMemberInfo: () => [],
    useMediaPacks: () => ({}),
    useUserMetadata: () => null,
  });
});
vi.mock('@/components/chat/LinkPreview', () => ({ default: () => null }));

import MessageContent from '@/components/chat/MessageContent';

/**
 * This file deliberately does not preload the markdown module: it checks the
 * first render, before react-markdown has arrived.
 */
describe('MessageContent before the markdown renderer has loaded', () => {
  it('shows the plain text, escaped, and then swaps in the rendered markdown', async () => {
    const { container } = render(<MessageContent content={'**bold** <b data-testid="raw-b">x</b>'} />);
    const plain = screen.getByTestId('message-text-loading');
    expect(plain).toHaveTextContent('**bold** <b data-testid="raw-b">x</b>');
    expect(screen.queryByTestId('raw-b')).toBeNull();

    expect(await screen.findByText('bold', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByTestId('message-text-loading')).toBeNull();
    expect(screen.queryByTestId('raw-b')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });
});
