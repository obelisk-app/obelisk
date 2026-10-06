import { useEffect, useMemo, useState } from 'react';
import {
  getBridge,
  getBridgeImpl,
  useAdminsByGroup,
  useGroupCreators,
  useGroups,
  useMembersByGroup,
  type JsUserMetadata,
} from '@/services/nostr-bridge';
import { displayNameFor } from '@/utils/identity/display-name';
import { filterMembers, relayMentionCandidates, type MemberInfo } from '@/utils/message-text/mentions';

/** Every kind 0 the bridge holds, live. The mention picker and the bot rail both read names from it. */
export function useComposerMetadata(): Record<string, JsUserMetadata> {
  const [metaMap, setMetaMap] = useState<Record<string, JsUserMetadata>>({});
  useEffect(() => {
    let unsub: (() => void) | undefined;
    void getBridge().then(() => {
      const impl = getBridgeImpl();
      if (!impl) return;
      unsub = impl.userMetadata.subscribe((m) => setMetaMap(m));
    });
    return () => { unsub?.(); };
  }, []);
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
  const groups = useGroups();
  const membersByGroup = useMembersByGroup();
  const adminsByGroup = useAdminsByGroup();
  const creatorsByGroup = useGroupCreators();
  const visibleGroupIds = useMemo(() => groups.map((g) => g.id), [groups]);
  const mentionCandidatePubkeys = useMemo(
    () => relayMentionCandidates(visibleGroupIds, membersByGroup, adminsByGroup, creatorsByGroup),
    [visibleGroupIds, membersByGroup, adminsByGroup, creatorsByGroup],
  );
  return useMemo<MemberInfo[]>(() => {
    if (mentionQuery === null) return [];
    // Materialize MemberInfo[] only when the picker is open. On a busy relay
    // the candidate set can be hundreds of pubkeys, and metaMap updates on
    // every kind 0 ingest; rebuilding eagerly would churn for nothing.
    const candidates: MemberInfo[] = mentionCandidatePubkeys.map((pk) => {
      const m = metaMap[pk];
      return {
        pubkey: pk,
        displayName: displayNameFor(pk, m),
        picture: m?.picture ?? undefined,
        lud16: m?.lud16 ?? undefined,
      };
    });
    return filterMembers(candidates, mentionQuery).slice(0, maxMentionResults);
  }, [mentionCandidatePubkeys, metaMap, mentionQuery, maxMentionResults]);
}
