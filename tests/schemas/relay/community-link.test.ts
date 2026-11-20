import { buildInviteLink } from '@applesauce/concord/helpers';
import { describe, expect, it } from 'vitest';
import { parseCommunityLink } from '@/schemas/relay/community-link';

describe('parseCommunityLink', () => {
  it('accepts a community address and both invitation formats', () => {
    expect(parseCommunityLink('chat.example')).toEqual({ kind: 'relay', url: 'wss://chat.example' });
    expect(parseCommunityLink('wss://chat.example/groups')).toEqual({ kind: 'relay', url: 'wss://chat.example/groups' });
    expect(parseCommunityLink('https://obelisk.example/es/invite/code-abc?relay=chat.example'))
      .toEqual({ kind: 'relay-invite', code: 'code-abc', relay: 'wss://chat.example' });
    const invite = buildInviteLink('https://obelisk.example', 'a'.repeat(64), new Uint8Array(16), ['wss://chat.example']);
    expect(parseCommunityLink(invite)).toEqual({ kind: 'concord', url: invite });
  });

  it('does not treat invalid invitations or arbitrary website URLs as community addresses', () => {
    expect(parseCommunityLink('https://obelisk.example/invite/naddr1invalid#secret')).toBeNull();
    expect(parseCommunityLink('https://obelisk.example/marketing')).toBeNull();
    expect(parseCommunityLink('file:///etc/hostname')).toBeNull();
    expect(parseCommunityLink('wss://user:password@chat.example')).toBeNull();
    expect(parseCommunityLink('chat.example#secret')).toBeNull();
  });
});
