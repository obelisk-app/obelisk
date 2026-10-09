import type { JsUserMetadata } from '@/services/nostr-bridge';
import type { LoginMethod } from '@/services/nostr-bridge';
import type { SessionNotice } from '@/services/nostr-bridge';
import type { NipSigner } from '@/types/nostr/nip-signer';
import type { LoginArgs, GeneratedProfileDraft } from './login';
import type { ProfileFormValues, ProfileUploading } from './profile';

/** A public projection of the bridge session. Never contains private keys or pairing credentials. */
export interface SessionSnapshot {
  readonly generation: number;
  readonly ready: boolean;
  readonly isLoggedIn: boolean;
  readonly isRehydrating: boolean;
  readonly pubkey: string | null;
  readonly loginMethod: LoginMethod | null;
  readonly extensionIdentityPending: boolean;
  readonly bunkerSignerReady: boolean;
  readonly signerReady: boolean;
  readonly notice: SessionNotice | null;
  readonly profile: JsUserMetadata | null;
}

export type { ProfileUploading } from './profile';

/** Account commands; consumers do not reach into bridge login or profile internals. */
export interface SessionActions {
  login(args: LoginArgs): Promise<void>;
  logout(): Promise<void>;
  updateProfile(values: ProfileFormValues, onUploading?: (which: ProfileUploading) => void): Promise<void>;
  publishGeneratedProfile(nsec: string, draft: GeneratedProfileDraft): Promise<void>;
}

/** Stable external-store adapter owned by one SessionProvider. */
export interface SessionController {
  readonly actions: SessionActions;
  subscribe(listener: () => void): () => void;
  getSnapshot(): SessionSnapshot;
  getSigner(): NipSigner | null;
  start(): () => void;
}
