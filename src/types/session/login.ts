import type { LoginMethodId } from '@nostr-wot/ui';

/** Transient SDK handoff; passed to the bridge, never placed in the public session snapshot. */
export interface LoginArgs {
  method: LoginMethodId;
  pubkey: string;
  nsec?: string;
  bunkerUri?: string;
  clientNsec?: string;
  signer?: unknown;
}

export type GeneratedProfileDraft = { name?: string; about?: string; picture?: string; banner?: string };
