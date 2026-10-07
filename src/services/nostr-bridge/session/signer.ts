/**
 * The session's signer (round 4 plan, step 18, `session/signer.ts`): event
 * templates and NIP-42 AUTH events signed by whichever login method is
 * active, plus the two signer objects other layers consume, the NIP-59 one
 * (`./nip-signer.ts`) and the DM transport one (`./dm-signer.ts`). Pure
 * move from `client.ts`.
 */
import { CodedError, type ActivityCode } from '@/utils/errors/codes';
import { finalizeEvent, type Event as NostrEvent, type EventTemplate, type VerifiedEvent } from 'nostr-tools';
import { trackActivity } from '@/services/feedback/activity-log';
import type { BridgeContext } from '../facade/context';
import { hexToBytes } from '../common/hex';
import { eventKindDescription } from '../common/kind-description';
import { enqueueSignerOp } from './signer-queue';
import { BUNKER_AUTH_SIGNATURE_TIMEOUT_MS, type BunkerModule } from './bunker';

export type SessionSignerContext = Pick<BridgeContext, 'session'>;

export class SessionSigner {
  constructor(
    private readonly ctx: SessionSignerContext,
    private readonly bunker: Pick<BunkerModule, 'run'>,
  ) {}

  /**
   * Sign an arbitrary event template with the active session's signer
   * (nsec → finalizeEvent, nip07 → window.nostr.signEvent). Used by callers
   * that need a signed event without publishing it, e.g. Blossom BUD-01
   * upload-auth events that travel in the HTTP Authorization header.
   */
  async signEventTemplate(
    template: { kind: number; content: string; tags: string[][]; created_at?: number },
  ): Promise<NostrEvent> {
    const session = this.ctx.session();
    if (!session) throw new CodedError('not-logged-in', 'Not logged in');
    const fullTemplate = {
      kind: template.kind,
      content: template.content,
      tags: template.tags,
      created_at: template.created_at ?? Math.floor(Date.now() / 1000),
    } satisfies EventTemplate;
    if (session.loginMethod === 'nsec' && session.privKeyHex) {
      const sk = hexToBytes(session.privKeyHex);
      return finalizeEvent(fullTemplate, sk) as NostrEvent;
    }
    if (session.loginMethod === 'nip07') {
      const win = window.nostr;
      if (!win) throw new CodedError('extension-missing', 'NIP-07 extension unavailable');
      return await trackActivity(
        'signExtension' satisfies ActivityCode,
        () => enqueueSignerOp(
          'interactive',
          `signEvent:${template.kind}`,
          () => win.signEvent(fullTemplate) as Promise<NostrEvent>,
        ),
        undefined,
        { operation: "sign", eventKind: template.kind, description: eventKindDescription(template.kind) },
      );
    }
    if (session.loginMethod === 'bunker') {
      return await trackActivity(
        'signBunker' satisfies ActivityCode,
        () => this.bunker.run(
          (b) => b.signEvent(fullTemplate) as Promise<NostrEvent>,
          { lane: 'interactive', label: `signEvent:${template.kind}` },
        ),
        undefined,
        { operation: "sign", eventKind: template.kind, description: eventKindDescription(template.kind) },
      );
    }
    throw new CodedError('signer-unsupported', `Login method ${session.loginMethod} cannot sign events in this build`); // i18n-exempt: developer message; readers get the code
  }

  /**
   * Sign one NIP-42 AUTH event with the session's method. No memo here: the
   * hub keeps the one AUTH record per `relay|pubkey` and hands this function
   * out as the identity's signer, so every concurrent challenge on a socket
   * shares one signature and a new socket generation signs once.
   */
  signSessionAuth(evt: EventTemplate): Promise<VerifiedEvent> {
    const session = this.ctx.session();
    if (!session) return Promise.reject(new CodedError('not-logged-in', 'Not logged in'));
    const unsigned = { kind: evt.kind, content: evt.content, tags: evt.tags, created_at: evt.created_at };
    return (async (): Promise<VerifiedEvent> => {
      if (session.loginMethod === 'nsec' && session.privKeyHex) {
        return finalizeEvent(unsigned, hexToBytes(session.privKeyHex)) as VerifiedEvent;
      }
      if (session.loginMethod === 'nip07') {
        const win = (window as unknown as {
          nostr?: { signEvent: (event: EventTemplate) => Promise<VerifiedEvent> };
        }).nostr;
        if (!win) throw new CodedError('extension-missing', 'NIP-07 extension unavailable');
        return trackActivity(
          'signExtension' satisfies ActivityCode,
          () => enqueueSignerOp(
            'interactive',
            'nip42-auth',
            () => win.signEvent(unsigned) as Promise<VerifiedEvent>,
          ),
          undefined,
          { operation: 'sign', eventKind: evt.kind, description: eventKindDescription(evt.kind) },
        );
      }
      if (session.loginMethod === 'bunker') {
        return trackActivity(
          'signBunker' satisfies ActivityCode,
          // The deadline is handed to `withBunkerSigner` rather than wrapped
          // around it so it starts when the request reaches the signer, not
          // when it joins the queue. See that method's doc comment.
          () => this.bunker.run(
            (b) => b.signEvent(unsigned) as Promise<VerifiedEvent>,
            {
              lane: 'interactive',
              label: 'nip42-auth',
              deadlineMs: BUNKER_AUTH_SIGNATURE_TIMEOUT_MS,
              deadlineMessage: 'Remote signer did not answer NIP-42 relay authentication',
            },
          ),
          undefined,
          { operation: 'sign', eventKind: evt.kind, description: eventKindDescription(evt.kind) },
        );
      }
      throw new CodedError('signer-unsupported', 'Cannot sign auth event with current login method');
    })();
  }

  /**
   * The `onauth` the bridge offers on a REQ or publish. Through the hub's
   * pass-through pool this is replaced by the hub's lease-gated signer for
   * the relay named in the challenge; what matters here is whether the
   * bridge offers to identify at all (undefined when logged out).
   */
  getAuthSigner(): ((evt: EventTemplate) => Promise<VerifiedEvent>) | undefined {
    return this.ctx.session() ? (evt) => this.signSessionAuth(evt) : undefined;
  }
}
