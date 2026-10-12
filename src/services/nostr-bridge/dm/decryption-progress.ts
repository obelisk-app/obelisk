import type { Event } from 'nostr-tools';
import type { DmEncryptedMessage } from '@/types/chat/dm-encrypted';
import { MAX_HELD } from '@/constants/nostr-bridge/dm';

/** Session-only envelope metadata; never treat a gift wrap's ephemeral key as its sender. */
export class DmDecryptionProgress {
  private readonly messages = new Map<string, DmEncryptedMessage>();
  peerFor(id: string): string | null { return this.messages.get(id)?.counterparty ?? null; }
  clear(): void { this.messages.clear(); }
  settle(id: string): void {
    if (this.messages.get(id)?.status === 'decrypting') this.messages.delete(id);
  }
  snapshot(known: ReadonlySet<string>): DmEncryptedMessage[] {
    for (const id of this.messages.keys()) if (known.has(id)) this.messages.delete(id);
    return [...this.messages.values()];
  }
  track(account: string | null, ev: Event, kind: 'nip04' | 'wrap', status: DmEncryptedMessage['status'], sender?: string, pq = false): void {
    const prior = this.messages.get(ev.id);
    const outgoing = kind === 'nip04' ? ev.pubkey === account : sender ? sender === account : prior?.outgoing ?? false;
    const peer = kind === 'nip04' ? (outgoing ? ev.tags.find((t) => t[0] === 'p')?.[1] : ev.pubkey) : (sender !== account ? sender : undefined);
    if (!prior && this.messages.size >= MAX_HELD) this.messages.delete(this.messages.keys().next().value!);
    this.messages.set(ev.id, {
      id: ev.id, counterparty: peer ?? prior?.counterparty ?? null, outgoing, status,
      ...(kind === 'nip04' ? { createdAt: ev.created_at } : {}),
      encryption: kind === 'nip04' ? 'nip04' : sender ? (pq ? 'pq' : 'nip44') : prior?.encryption ?? 'unknown',
    });
  }
}
