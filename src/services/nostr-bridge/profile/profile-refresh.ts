import type { Event as NostrEvent } from 'nostr-tools';
import { getPreferences } from '@/services/preferences/preferences';
import { parseProfileContent } from '@/schemas/identity/profile';
import { CodedError } from '@/utils/errors/codes';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';
import { PROFILE_LOOKUP_MAX_WAIT_MS } from '@/constants/nostr-bridge/profile';
import type { ProfilesContext } from './profiles';
import { newestEvent, setCachedKind0 } from './profile-sync-cache';

/** Explicit revalidation bypasses display TTLs and shares concurrent callers. */
export class ProfileRefresh {
  private readonly pending = new Map<string, Promise<void>>();
  constructor(private readonly ctx: ProfilesContext, private readonly relays: () => string[], private readonly ingest: (event: NostrEvent) => void) {}

  refresh(pubkey: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/i.test(pubkey)) return Promise.reject(new CodedError('profile-load-failed', 'Invalid profile key.'));
    const existing = this.pending.get(pubkey);
    if (existing) return existing;
    const request = this.run(pubkey).finally(() => this.pending.delete(pubkey));
    this.pending.set(pubkey, request);
    return request;
  }

  private async run(pubkey: string): Promise<void> {
    const relays = [...new Set([...this.ctx.relays(), ...this.relays(), ...getPreferences().socialRelays])];
    const result = await this.ctx.queryAuthorsWithConfidence(relays,
      [{ kinds: [KIND_METADATA], authors: [pubkey], limit: 5 }], PROFILE_LOOKUP_MAX_WAIT_MS, { cache: 'fresh' });
    const event = newestEvent(result.perFilter[0] ?? []);
    if (event) {
      if (!parseProfileContent(event.content)) throw new CodedError('profile-load-failed', 'Invalid profile.');
      setCachedKind0(event);
      this.ingest(event);
    }
    if (!result.complete) throw new CodedError('profile-lookup-timeout', 'Could not verify the current profile. Try again.');
    if (!event) throw new CodedError('profile-load-failed', 'No profile found.');
  }
}
