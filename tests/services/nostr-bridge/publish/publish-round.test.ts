/**
 * Reading the hub's publish rows back per target (`publish-round.ts`), the
 * shape `publish-results.ts` and the relay-access tracking consume.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import type { PublishResult, PublishSpec } from '@nostr-wot/relay/hub';
import { publishRound, settledFor } from '@/services/nostr-bridge/publish/publish-round';
import { PUBLISH_TIMED_OUT } from '@/constants/nostr-bridge/publish';
import { timedOutEverywhere, acceptedOf } from '@/services/nostr-bridge/publish/publish-results';

const A = 'wss://a.example';
const B = 'wss://b.example';
const row = (url: string, status: PublishResult['status'], reason: string | null = null): PublishResult => ({ url: url + '/', status, reason });

describe('settledFor', () => {
  it('lines one result up with each target, by normalized URL', () => {
    const out = settledFor([B, A], [row(A, 'ok', ''), row(B, 'rejected', 'blocked: no')]);
    expect(out[0]).toMatchObject({ status: 'rejected' });
    expect((out[0] as PromiseRejectedResult).reason.message).toBe('blocked: no');
    expect(out[1]).toEqual({ status: 'fulfilled', value: '' });
  });

  it('counts an unreachable relay as a refusal, not an acceptance', () => {
    const out = settledFor([A], [row(A, 'unreachable', 'relay wss://a.example/ unreachable (connecting)')]);
    expect(acceptedOf(out)).toHaveLength(0);
    expect((out[0] as PromiseRejectedResult).reason.message).toMatch(/unreachable/);
  });

  it('words a timeout so the timed-out-everywhere retry recognises it', () => {
    const out = settledFor([A, B], [row(A, 'timeout'), row(B, 'timeout')]);
    expect((out[0] as PromiseRejectedResult).reason.message).toBe(PUBLISH_TIMED_OUT);
    expect(timedOutEverywhere(acceptedOf(out), out)).toBe(true);
  });

  it('answers a repeated target `duplicate url`, as the old pool did', () => {
    const out = settledFor([A, A + '/'], [row(A, 'ok', '')]);
    expect(out[0].status).toBe('fulfilled');
    expect((out[1] as PromiseRejectedResult).reason.message).toBe('duplicate url');
  });
});

describe('publishRound', () => {
  it('hands the hub the targets, the AUTH mode and an explicit ack wait', async () => {
    const specs: PublishSpec[] = [];
    const hub = {
      publish: vi.fn(async (spec: PublishSpec) => {
        specs.push(spec);
        return spec.relays.map((url) => row(url, 'ok', ''));
      }),
    };
    const event = { id: 'e', kind: 20078 } as NostrEvent;
    const out = await publishRound(hub, [A], event, 'never', 4000);
    expect(out).toEqual([{ status: 'fulfilled', value: '' }]);
    expect(specs[0]).toMatchObject({ relays: [A], authMode: 'never', ackTimeoutMs: 4000 });
    await publishRound(hub, [A], event, 'policy');
    expect(specs[1].ackTimeoutMs).toBeUndefined();
  });
});
