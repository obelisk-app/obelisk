import { describe, expect, it, vi } from 'vitest';
import { RumorStore } from 'applesauce-core';
import { getEventHash, generateSecretKey, getPublicKey } from 'nostr-tools';
import { createCommunity, foldControl } from '@applesauce/concord/helpers';
import { PERM, type DecodedEvent, type RumorTemplate } from '@applesauce/concord';
import { ConcordCommunityAdmin } from '../../../../node_modules/@applesauce/concord/dist/client/admin.js';

async function fixture() {
  const owner = getPublicKey(generateSecretKey());
  const member = getPublicKey(generateSecretKey());
  const genesis = await createCommunity({ ownerPubkey: owner, name: 'Test', relays: ['wss://example.invalid'] });
  const events: DecodedEvent[] = [];
  let state = foldControl(events, genesis.material);
  const echo = (template: RumorTemplate) => {
    const event = { ...template, created_at: template.created_at ?? Math.floor(Date.now() / 1000), pubkey: owner };
    const rumor = { ...event, id: getEventHash(event) };
    events.push({ rumor, author: owner, wrapId: rumor.id, sealKind: 20014, ms: Date.now() });
    state = foldControl(events, state.material, state.controlVerification);
    return rumor.id;
  };
  const publish = vi.fn(async (rumor: RumorTemplate, check?: () => void) => {
    check?.();
    const id = echo(rumor);
    check?.(); // Model the SDK optimistic publication path that used to reject its own Grant.
    return id;
  });
  const publishRequired = vi.fn(async (rumor: RumorTemplate, check?: () => void) => {
    await Promise.resolve();
    check?.(); // Final signer boundary, before the ciphertext goes to the relay.
    return echo(rumor); // Required-ack publication echoes only after relay acceptance.
  });
  const prepareControlWrap = vi.fn(async () => 'pairwise-encrypted-root');
  const admin = new ConcordCommunityAdmin({ community: {} as never, store: new RumorStore(), state: () => state,
    pubkey: owner, publish, publishRequired, prepareControlWrap, mintChannelKey: () => {} });
  const role = await admin.createRole('Channels', 10, PERM.MANAGE_CHANNELS);
  publish.mockClear();
  return { admin, role, member, publish, publishRequired, prepareControlWrap, state: () => state };
}

describe('staff Grant publication ordering', () => {
  it('publishes an acknowledged Grant before echo and grants channel authority', async () => {
    const h = await fixture();
    await h.admin.grantRoles(h.member, [h.role]);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.publishRequired).toHaveBeenCalledOnce();
    expect(h.state().grants.get(h.member)).toEqual([h.role]);
    expect(h.admin.standingOf(h.member).permissions).toBe(PERM.MANAGE_CHANNELS);
  });
  it('still rejects a role changed during root encryption', async () => {
    const h = await fixture();
    h.prepareControlWrap.mockImplementation(async () => {
      await h.admin.editRole(h.role, { permissions: '0' });
      return 'pairwise-encrypted-root';
    });
    await expect(h.admin.grantRoles(h.member, [h.role])).rejects.toThrow('state changed');
    expect(h.publishRequired).not.toHaveBeenCalled();
    expect(h.state().grants.has(h.member)).toBe(false);
  });
  it('still rejects an epoch change during root encryption', async () => {
    const h = await fixture();
    h.prepareControlWrap.mockImplementation(async () => {
      h.state().material.root_epoch++;
      return 'pairwise-encrypted-root';
    });
    await expect(h.admin.grantRoles(h.member, [h.role])).rejects.toThrow('state changed');
    expect(h.publishRequired).not.toHaveBeenCalled();
  });
  it('reports relay refusal without claiming a granted role', async () => {
    const h = await fixture();
    h.publishRequired.mockRejectedValue(new Error('No relay accepted'));
    await expect(h.admin.grantRoles(h.member, [h.role])).rejects.toThrow('No relay accepted');
    expect(h.state().grants.has(h.member)).toBe(false);
  });
});
