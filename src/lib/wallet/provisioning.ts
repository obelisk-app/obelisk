// src/lib/wallet/provisioning.ts
// Quick-Setup wallet provisioning against zaps.nostr-wot.com. Mirrors the
// nostr-wot browser extension's flow: GET challenge → sign as NIP-98 →
// POST. Returns an NWC URI ready to use.
//
// The instance URL defaults to https://zaps.nostr-wot.com but can be
// overridden via NEXT_PUBLIC_NOSTR_WOT_PROVISION_URL — useful for local
// development against an http://localhost provisioning proxy or a
// self-hosted instance.

import { buildNip98Event, type Nip98Signer } from '../nip98';

export const PROVISION_URL =
  process.env.NEXT_PUBLIC_NOSTR_WOT_PROVISION_URL?.replace(/\/+$/, '') ||
  'https://zaps.nostr-wot.com';

export interface ProvisionResult {
  nwcUri: string;
  walletId: string;
  adminKey: string;
}

async function getChallenge(): Promise<string> {
  const res = await fetch(`${PROVISION_URL}/api/provision/challenge`);
  if (!res.ok) throw new Error(`challenge request failed: ${res.status}`);
  const body = (await res.json()) as { challenge: string };
  return body.challenge;
}

async function authedPost(
  signer: Nip98Signer,
  endpoint: string,
  extraBody: Record<string, unknown> = {},
): Promise<unknown> {
  const challenge = await getChallenge();
  const url = `${PROVISION_URL}${endpoint}`;
  const event = await buildNip98Event(signer, url, 'POST', challenge);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, ...extraBody }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({} as Record<string, unknown>));
    const msg = (errBody as { error?: string }).error ?? `request failed: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export async function provisionWallet(signer: Nip98Signer): Promise<ProvisionResult> {
  const npub = await signer.getPublicKey();
  const walletName = `WoT:${npub.slice(0, 16)}`;
  const data = (await authedPost(signer, '/api/provision', { name: walletName })) as {
    id: string;
    adminkey: string;
    nwcUri?: string;
  };
  if (!data.nwcUri) {
    throw new Error('provisioning succeeded but nwcUri missing in response');
  }
  return { nwcUri: data.nwcUri, walletId: data.id, adminKey: data.adminkey };
}

export async function claimLightningAddress(
  signer: Nip98Signer,
  username: string,
): Promise<{ address: string }> {
  return authedPost(signer, '/api/claim-username', { username }) as Promise<{ address: string }>;
}

export async function getLightningAddress(pubkey: string): Promise<string | null> {
  const res = await fetch(`${PROVISION_URL}/api/lightning-address?pubkey=${encodeURIComponent(pubkey)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as { address: string | null };
  return body.address;
}

export async function releaseLightningAddress(signer: Nip98Signer): Promise<void> {
  await authedPost(signer, '/api/release-username');
}
