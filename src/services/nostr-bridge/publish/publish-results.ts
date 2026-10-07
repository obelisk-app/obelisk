/**
 * Reading a publish round's per-relay results (the synchronous half of
 * `PublishModule.publishSignedEvent`): the refusal reason, the relay-access
 * verdicts a refusal reports, and the tests that pick a retry (everything
 * timed out, a NIP-42 refusal, an "already a member" join). The awaits
 * stay in `publish.ts`.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_GROUP_JOIN_REQUEST } from '@/utils/nostr/nip-kinds';
import type { BridgeContext } from '../facade/context';
import { pushRelayDebug } from '../relay/relay-debug';
import { isWhitelistRefusal, parseRelayRejection } from './relay-rejection';

export type PublishResults = PromiseSettledResult<string>[];

/** The refusal text of one relay's result. */
export function reasonOf(r: PromiseRejectedResult): string {
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}

/**
 * Surface NIP-42 / whitelist signals from the first round. Only rejections
 * flip state: successful publishes are marked 'ok' by the read path. Auth
 * and whitelist refusals during a publish are usually transient (NIP-42
 * AUTH not yet completed for the session, a NIP-29 membership write race),
 * so they go through the soak; an explicit whitelist refusal overrides.
 */
export function reportRejections(
  ctx: Pick<BridgeContext, 'setRelayAccess' | 'setRelayAccessDeferred'>,
  results: PublishResults,
  targetRelays: readonly string[],
  eventKind: number,
): void {
  results.forEach((r, i) => {
    if (r.status !== 'rejected') return;
    const reason = reasonOf(r);
    pushRelayDebug({ kind: "publish-reject", relay: targetRelays[i], eventKind, reason });
    const state = parseRelayRejection(reason);
    if (!state) return;
    if (isWhitelistRefusal(reason)) {
      ctx.setRelayAccess(targetRelays[i], 'restricted', { override: true });
    } else if (state === 'auth-required' || state === 'restricted') {
      ctx.setRelayAccessDeferred(targetRelays[i], state);
    } else {
      ctx.setRelayAccess(targetRelays[i], state);
    }
  });
}

/** After a retry round: each refusal's verdict through `report` (immediate or soaked, per caller). */
export function reportRetryRejections(
  results: PublishResults,
  targetRelays: readonly string[],
  report: (url: string, state: NonNullable<ReturnType<typeof parseRelayRejection>>) => void,
): void {
  results.forEach((r, i) => {
    if (r.status !== 'rejected') return;
    const state = parseRelayRejection(reasonOf(r));
    if (state) report(targetRelays[i], state);
  });
}

export function acceptedOf(results: PublishResults): PublishResults {
  return results.filter((r) => r.status === 'fulfilled');
}

/** No relay accepted and every one of them timed out: the NIP-42 race after a switch. */
export function timedOutEverywhere(accepted: PublishResults, results: PublishResults): boolean {
  return accepted.length === 0
    && results.every((r) => {
      if (r.status === 'fulfilled') return false;
      const reason = reasonOf(r).toLowerCase();
      return reason.includes('time') && reason.includes('out');
    });
}

/** The relays that refused in NIP-42 or whitelist terms (`authRetryOnRestricted`). */
export function authShapedRefusals(results: PublishResults): number[] {
  return results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return [];
    const state = parseRelayRejection(reasonOf(r));
    return state === 'auth-required' || state === 'restricted' ? [i] : [];
  });
}

/** This relay refused with `auth-required`. */
export function isAuthRequired(result: PromiseSettledResult<string> | undefined): boolean {
  return result?.status === 'rejected' && parseRelayRejection(reasonOf(result)) === 'auth-required';
}

/** At least one relay refused with `auth-required` (`authMode: 'last-resort'`). */
export function anyAuthRequired(results: PublishResults): boolean {
  return results.some(isAuthRequired);
}

/** A join request refused because the user already is a member counts as done. */
export function alreadyJoined(event: NostrEvent, results: PublishResults): boolean {
  return event.kind === KIND_GROUP_JOIN_REQUEST
    && results.some((r) => r.status !== 'fulfilled' && reasonOf(r).toLowerCase().includes('already a member'));
}

/** The English message of the error a fully refused publish throws, naming each relay's reason (readers get its code). */
export function rejectionMessage(event: NostrEvent, results: PublishResults, targetRelays: readonly string[]): string {
  const reasons = results
    .map((r, i) => (r.status === 'fulfilled' ? null : `${targetRelays[i]}: ${reasonOf(r)}`))
    .filter(Boolean)
    .join('; ');
  return `Relay rejected event (kind ${event.kind}). ${reasons || 'no relay accepted'}`; // i18n-exempt: developer message of the publish-rejected CodedError
}
