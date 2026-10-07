import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import WhoToFollowWidget from '@/components/social/widgets/WhoToFollowWidget';

const hex = (c: string) => c.repeat(64);
const twice = (pubkey: string): NostrEvent[] => [1, 2].map((n) => ({
  id: `${pubkey}${n}`, pubkey, kind: 1, content: '', created_at: n, sig: '', tags: [],
}));

describe('WhoToFollowWidget', () => {
  it('lists people from the feed and opens a profile', () => {
    const onOpenProfile = vi.fn();
    const fake = fakeBridge({ myPubkey: hex('a') });
    renderWithBridge(<WhoToFollowWidget notes={[...twice(hex('a')), ...twice(hex('c'))]} onOpenProfile={onOpenProfile} />, fake);
    const rows = screen.getAllByTestId('who-to-follow-row');
    expect(rows).toHaveLength(1);
    fireEvent.click(rows[0].querySelector('button')!);
    expect(onOpenProfile).toHaveBeenCalledWith(hex('c'));
  });

  it('says so when there is nobody to suggest', () => {
    renderWithBridge(<WhoToFollowWidget notes={[]} />, fakeBridge());
    expect(screen.getByTestId('who-to-follow-empty')).toBeInTheDocument();
  });
});
