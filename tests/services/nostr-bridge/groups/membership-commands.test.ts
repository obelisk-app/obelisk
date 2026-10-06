import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { MembershipCommands } from '@/services/nostr-bridge/groups/membership-commands';

function commands() {
  const signAndPublish = vi.fn(
    async (template: { kind: number; content: string; tags: string[][]; created_at: number }, _relays?: unknown, _opts?: unknown): Promise<NostrEvent> =>
      ({ ...template, id: 'id', pubkey: 'me', sig: 'sig' }),
  );
  return { cmd: new MembershipCommands({ signAndPublish }), signAndPublish };
}

describe('groups/membership-commands', () => {
  it('signs one NIP-29 command per call, scoped to the channel', async () => {
    const { cmd, signAndPublish } = commands();
    await cmd.joinGroup('g');
    await cmd.leaveGroup('g');
    await cmd.putUser('g', 'pk', ['admin'], { quiet: true });
    await cmd.removeUser('g', 'pk');
    await cmd.removePermission('g', 'pk', ['admin']);
    expect(signAndPublish.mock.calls.map((c) => [c[0].kind, c[0].tags])).toEqual([
      [9021, [['h', 'g']]],
      [9022, [['h', 'g']]],
      [9000, [['h', 'g'], ['p', 'pk', 'admin']]],
      [9001, [['h', 'g'], ['p', 'pk']]],
      [9003, [['h', 'g'], ['p', 'pk', 'admin']]],
    ]);
    expect(signAndPublish.mock.calls[2].slice(1)).toEqual([[], { quiet: true }]);
  });

  it('sends nothing for an empty permission list', async () => {
    const { cmd, signAndPublish } = commands();
    await cmd.removePermission('g', 'pk', []);
    expect(signAndPublish).not.toHaveBeenCalled();
  });
});
