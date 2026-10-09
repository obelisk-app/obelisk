import { traceLogin } from '@/services/session/login-trace';
import { readExtensionPubkey } from './extension-identity';
import type { SessionState } from './state';

/** The extension's window event is a hint, never an authenticated identity. */
export class ExtensionAccountEvents {
  private wired = false;
  private revision = 0;
  private running = false;
  private requested = false;

  constructor(
    private readonly state: SessionState,
    private readonly login: (pubkey: string) => Promise<void>,
  ) {}

  private readonly onChanged = (): void => {
    if (this.state.session?.loginMethod !== 'nip07') return;
    this.revision++;
    this.requested = true;
    this.state.extensionIdentityPending = true;
    this.state.extensionIdentityRevision++;
    if (!this.running) void this.reconcile();
  };

  private async reconcile(): Promise<void> {
    this.running = true;
    try {
      while (this.wired && this.state.session?.loginMethod === 'nip07') {
        this.requested = false;
        const revision = this.revision;
        const generation = this.state.sessionGeneration;
        const session = this.state.session;
        const isCurrent = () => this.wired && this.state.sessionGeneration === generation && this.state.session === session;
        let pubkey: string;
        try {
          pubkey = await readExtensionPubkey();
        } catch {
          if (!isCurrent()) return;
          if (revision !== this.revision) continue;
          // Fail closed: existing extension capabilities stay suspended until
          // a later event verifies the identity or the user logs in again.
          traceLogin('extension.account-change.failed');
          return;
        }
        if (!isCurrent()) return;
        if (revision !== this.revision) continue;
        this.state.extensionIdentityPending = false;
        if (pubkey !== session.pubKeyHex) {
          // login starts its generation synchronously, before its first await.
          const applied = this.login(pubkey);
          const installedGeneration = this.state.sessionGeneration;
          const installedSession = this.state.session;
          try { await applied; } catch {
            traceLogin('extension.account-change.install-failed');
          }
          if (!this.wired || this.state.sessionGeneration !== installedGeneration || this.state.session !== installedSession) return;
        }
        if (revision === this.revision) return;
      }
    } finally {
      this.running = false;
      if (this.requested && this.wired && this.state.session?.loginMethod === 'nip07') void this.reconcile();
    }
  }

  wire(): void {
    if (typeof window === 'undefined' || this.wired) return;
    this.wired = true;
    window.addEventListener('nostr:accountChanged', this.onChanged);
  }

  unwire(): void {
    if (typeof window === 'undefined' || !this.wired) return;
    this.wired = false;
    this.requested = false;
    this.revision++;
    window.removeEventListener('nostr:accountChanged', this.onChanged);
  }
}
