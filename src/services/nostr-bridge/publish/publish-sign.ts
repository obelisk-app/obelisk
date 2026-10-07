/**
 * The signing half of `PublishModule.signAndPublish`: dispatch one template
 * to the session's signer (a local key, the NIP-07 extension through the
 * signer queue, or the NIP-46 bunker), with the activity-log entry and the
 * relay-debug lines around it. Split from `publish.ts` (round 16) so the
 * publish module holds only the relay round.
 */
import { CodedError, codeOrMessage, type ActivityCode } from '@/utils/errors/codes';
import { finalizeEvent, type Event as NostrEvent } from 'nostr-tools';
import { KIND_VOICE_PRESENCE } from '@/utils/nostr/nip-kinds';
import { failActivity, pushActivity, resolveActivity } from '@/services/feedback/activity-log';
import { pushRelayDebug } from '../relay/relay-debug';
import { eventKindDescription } from '../common/kind-description';
import { enqueueSignerOp, type SignerLane } from '../session/signer-queue';
import { hexToBytes } from '../common/hex';
import type { PersistedSession } from '../session/session-storage';
import type { RemoteSigner } from '../session/bunker';

export interface SignDeps {
  withBunkerSigner<T>(
    operation: (signer: RemoteSigner) => Promise<T>,
    opts?: { lane?: SignerLane; label?: string; startDeadlineMs?: number },
  ): Promise<T>;
  /** A kind 20078 the session just signed is its own presence; ingested before the publish. */
  onSigned(event: NostrEvent): void;
}

export type SignableTemplate = { kind: number; content: string; tags: string[][]; created_at: number };

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Sign `template` as `session`. `quiet` keeps the activity bar out of it
 * (a best-effort background write the user did not ask for);
 * `startDeadlineMs` gives up if a queued remote signer has not started on
 * it in time.
 */
export async function signForSession(
  session: PersistedSession,
  deps: SignDeps,
  template: SignableTemplate,
  opts: { quiet?: boolean; startDeadlineMs?: number } = {},
): Promise<NostrEvent> {
  const queueOpts = opts.startDeadlineMs !== undefined ? { startDeadlineMs: opts.startDeadlineMs } : undefined;
  const signLabel: ActivityCode =
    session.loginMethod === 'nip07' ? 'signExtension' : session.loginMethod === 'bunker' ? 'signBunker' : 'signLocal';
  const description = eventKindDescription(template.kind);
  const signId = opts.quiet ? null : pushActivity(
    signLabel,
    undefined,
    { operation: 'sign', eventKind: template.kind, description },
  );
  pushRelayDebug({ kind: 'sign-start', eventKind: template.kind, status: description });
  let event: NostrEvent;
  try {
    if (session.loginMethod === 'nsec' && session.privKeyHex) {
      event = finalizeEvent(template, hexToBytes(session.privKeyHex));
    } else if (session.loginMethod === 'nip07') {
      const win = window.nostr;
      if (!win) throw new CodedError('extension-missing', 'NIP-07 extension unavailable');
      event = (await enqueueSignerOp(
        'interactive',
        `signEvent:${template.kind}`,
        () => win.signEvent(template) as Promise<NostrEvent>,
        queueOpts,
      )) as NostrEvent;
    } else if (session.loginMethod === 'bunker') {
      event = await deps.withBunkerSigner(
        (b) => b.signEvent(template) as Promise<NostrEvent>,
        { lane: 'interactive', label: `signEvent:${template.kind}`, ...queueOpts },
      );
    } else {
      throw new CodedError('signer-unsupported', `Login method ${session.loginMethod} cannot sign events in this build`); // i18n-exempt: developer message; readers get the code
    }
    if (template.kind === KIND_VOICE_PRESENCE) deps.onSigned(event);
    if (signId != null) resolveActivity(signId);
    pushRelayDebug({ kind: 'sign-ok', eventKind: template.kind, status: description });
  } catch (e) {
    if (signId != null) failActivity(signId, codeOrMessage(e));
    pushRelayDebug({ kind: 'sign-error', eventKind: template.kind, status: description, reason: messageOf(e) });
    throw e;
  }
  return event;
}
