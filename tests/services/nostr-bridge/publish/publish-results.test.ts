import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  acceptedOf,
  alreadyJoined,
  anyAuthRequired,
  authShapedRefusals,
  rejectionMessage,
  reportRejections,
  timedOutEverywhere,
  type PublishResults,
} from '@/services/nostr-bridge/publish/publish-results';

const ok = (v = 'ok'): PromiseFulfilledResult<string> => ({ status: 'fulfilled', value: v });
const no = (reason: string): PromiseRejectedResult => ({ status: 'rejected', reason: new Error(reason) });
const ev = (kind: number): NostrEvent => ({ id: 'e', pubkey: 'p', kind, created_at: 1, content: '', tags: [], sig: '' });

describe('publish-results', () => {
  it('reports a whitelist refusal at once, an auth race through the soak, and nothing for an accept', () => {
    const ctx = { setRelayAccess: vi.fn(), setRelayAccessDeferred: vi.fn() };
    const results: PublishResults = [ok(), no('restricted: not on the whitelist'), no('auth-required: sign in')];
    reportRejections(ctx, results, ['wss://a', 'wss://b', 'wss://c'], 1);
    expect(ctx.setRelayAccess).toHaveBeenCalledWith('wss://b', 'restricted', { override: true });
    expect(ctx.setRelayAccessDeferred).toHaveBeenCalledWith('wss://c', 'auth-required');
    expect(ctx.setRelayAccess).toHaveBeenCalledTimes(1);
  });

  it('picks the retries: all timed out, auth-shaped refusals by index, an auth-required anywhere', () => {
    const timedOut: PublishResults = [no('publish timed out'), no('Timed out waiting')];
    expect(timedOutEverywhere(acceptedOf(timedOut), timedOut)).toBe(true);
    const mixed: PublishResults = [ok(), no('publish timed out')];
    expect(timedOutEverywhere(acceptedOf(mixed), mixed)).toBe(false);
    const refused: PublishResults = [ok(), no('restricted: who are you'), no('rate-limited: slow down'), no('auth-required: x')];
    expect(authShapedRefusals(refused)).toEqual([1, 3]);
    expect(anyAuthRequired(refused)).toBe(true);
    expect(anyAuthRequired([no('restricted: x')])).toBe(false);
  });

  it('treats an already-a-member join as done and names every refusal otherwise', () => {
    const results: PublishResults = [no('duplicate: already a member of this group')];
    expect(alreadyJoined(ev(9021), results)).toBe(true);
    expect(alreadyJoined(ev(9), results)).toBe(false);
    expect(rejectionMessage(ev(9), [ok(), no('blocked: x')], ['wss://a', 'wss://b'])).toBe('Relay rejected event (kind 9). wss://b: blocked: x');
    expect(rejectionMessage(ev(9), [], [])).toBe('Relay rejected event (kind 9). no relay accepted');
  });
});
