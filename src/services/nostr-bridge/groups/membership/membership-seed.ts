/**
 * The cold paint of a relay's membership from the local cache: admins
 * (kind 39001), members (kind 39002) and creators (kind 9007) per group,
 * skipping hidden groups. Read-only; `MembershipModule.seedFromCache`
 * merges the result under whatever the relay already delivered.
 */
import { KIND_GROUP_ADMINS, KIND_GROUP_CREATE, KIND_GROUP_MEMBERS } from '@/utils/nostr/nip-kinds';
import { cacheGet } from '../../cache/cache';

export interface MembershipSeed {
  readonly admins: Record<string, string[]>;
  readonly members: Record<string, string[]>;
  readonly creators: Record<string, string>;
}

function readKind<T>(
  relay: string,
  kind: number,
  hidden: ReadonlySet<string>,
  idsFor: (kind: number) => readonly string[],
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const groupId of idsFor(kind)) {
    if (hidden.has(groupId)) continue;
    const entry = cacheGet<T>(relay, kind, groupId);
    if (entry) out[groupId] = entry.value;
  }
  return out;
}

export function readMembershipSeed(
  relay: string,
  hidden: ReadonlySet<string>,
  idsFor: (kind: number) => readonly string[],
): MembershipSeed {
  return {
    admins: readKind<string[]>(relay, KIND_GROUP_ADMINS, hidden, idsFor),
    members: readKind<string[]>(relay, KIND_GROUP_MEMBERS, hidden, idsFor),
    creators: readKind<string>(relay, KIND_GROUP_CREATE, hidden, idsFor),
  };
}
