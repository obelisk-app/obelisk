import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UserName from '@/components/identity/UserName';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { userMetadataFixture } from '@tests/support/mocks/nostr-bridge';
import { petnameFor } from '@/utils/identity/display-name';

const ALICE = 'a'.repeat(64);
const BOB = 'b'.repeat(64);

describe('UserName', () => {
  it('keeps text-only hover card content unwrapped and updates when metadata arrives', () => {
    const bridge = fakeBridge();
    renderWithBridge(<div data-testid="name"><UserName pubkey={ALICE} /></div>, bridge);
    const name = screen.getByTestId('name');
    expect(name.textContent).toBe(petnameFor(ALICE));
    expect(name.children).toHaveLength(0);
    act(() => bridge.stores.userMetadata.set({ [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice' }) }));
    expect(name.textContent).toBe('Alice');
    expect(name.children).toHaveLength(0);
  });

  it('preserves reply-bar styling while switching the subscribed identity', () => {
    const bridge = fakeBridge({ userMetadata: {
      [ALICE]: userMetadataFixture({ pubkey: ALICE, displayName: 'Alice' }),
      [BOB]: userMetadataFixture({ pubkey: BOB, displayName: 'Bob' }),
    } });
    const { rerender } = renderWithBridge(<UserName pubkey={ALICE} className="composer-reply-author" />, bridge);
    expect(screen.getByText('Alice')).toHaveClass('composer-reply-author');
    rerender(<UserName pubkey={BOB} className="font-semibold text-lc-white" />);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toHaveClass('font-semibold', 'text-lc-white');
  });
});
