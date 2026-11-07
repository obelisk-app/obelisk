import { useEffect, useMemo, useState } from 'react';
import {
  useRelayPeople,
  useBridge,
  type JsUserMetadata,
} from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import { filterMembers, type MemberInfo } from '@/utils/message-text/mentions';

/** Every kind 0 the bridge holds, live. The mention picker and the bot rail both read names from it. */
export function useComposerMetadata(enabled = true): Record<string, JsUserMetadata> {
  const bridge = useBridge();
  const [metaMap, setMetaMap] = useState<Record<string, JsUserMetadata>>({});
  useEffect(() => {
    if (!bridge || !enabled) return;
    return bridge.userMetadata.subscribe((m) => setMetaMap(m));
  }, [bridge, enabled]);
  return metaMap;
}

/**
 * The rows of the @-mention picker for `mentionQuery`.
 *
 * Mentions span the whole relay (every visible group's members + admins +
 * creator), not just the current channel: typing `@alice` should find
 * Alice even if she's only in a sister channel. WoT-hidden groups are
 * already excluded by `useGroups`.
 */
export function useMentionCandidates(
  mentionQuery: string | null,
  metaMap: Record<string, JsUserMetadata>,
  maxMentionResults: number,
): MemberInfo[] {
  const open = mentionQuery !== null;
  const people = useRelayPeople(undefined, open);
  return useMemo<MemberInfo[]>(() => {
    if (mentionQuery === null) return [];
    // Materialize MemberInfo[] only when the picker is open. On a busy relay
    // the candidate set can be hundreds of pubkeys, and metaMap updates on
    // every kind 0 ingest; rebuilding eagerly would churn for nothing.
    const candidates: MemberInfo[] = people.map((person) => {
      const pk = person.pubkey;
      const m = metaMap[pk];
      return {
        pubkey: pk,
        displayName: m ? displayNameFor(pk, m) : person.displayName,
        picture: m?.picture ?? person.picture,
        lud16: m?.lud16 ?? undefined,
      };
    });
    return filterMembers(candidates, mentionQuery).slice(0, maxMentionResults);
  }, [people, metaMap, mentionQuery, maxMentionResults]);
}
