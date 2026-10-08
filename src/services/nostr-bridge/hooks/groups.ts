/**
 * Group (channel) hooks: the WoT-filtered rail, the raw lookup for an
 * explicit navigation, the metadata EOSE, the category tree and creators.
 */
import { useEffect, useMemo, useState } from 'react';
import { wotEngine } from '@/services/wot/engine';
import { useWotEnabled } from '@/hooks/wot/useWot';
import type { JsGroup } from '../common/types';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useSubscription } from './subscription';

export function useGroups(): ReadonlyArray<JsGroup> {
  const all = useSubscription<ReadonlyArray<JsGroup>>((b, cb) => b.subscribeGroups(cb), []);
  const creators = useSubscription<Readonly<Record<string, string>>>(
    (b, cb) => b.subscribeGroupCreators(cb),
    {},
  );
  const adminsByGroup = useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>(
    (b, cb) => b.subscribeAdminsByGroup(cb),
    {},
  );
  const membersByGroup = useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>(
    (b, cb) => b.subscribeMembersByGroup(cb),
    {},
  );
  const myPubkey = useMyPubkey();
  const wotEnabled = useWotEnabled();
  // Re-render whenever a verdict resolves so groups whose admins just got a
  // verdict appear/disappear from the rail.
  const [verdictTick, force] = useState(0);
  useEffect(() => {
    if (!wotEnabled) return;
    return wotEngine.on('verdicts-changed', () => force((n) => n + 1));
  }, [wotEnabled]);
  return useMemo(() => {
    if (!wotEnabled) return all;
    // Strict policy: a group is shown iff one of these holds:
    //   - I created / am admin of / am member of the group (always-mine)
    //   - any of {creator, admins, members} has a resolved-allow verdict
    // Otherwise hidden, including groups where no principal is known yet,
    // since on relay-default group lists those are the spam channels the
    // user is trying to remove. The bridge's authors-scoped 9007 sub plus
    // per-group admin/member subs converge fast for legitimate groups.
    return all.filter((g) => {
      const creator = creators[g.id];
      const admins = adminsByGroup[g.id] ?? [];
      const members = membersByGroup[g.id] ?? [];
      if (myPubkey) {
        if (creator === myPubkey) return true;
        if (admins.includes(myPubkey)) return true;
        if (members.includes(myPubkey)) return true;
      }
      const principals = creator ? [creator, ...admins, ...members] : [...admins, ...members];
      let anyAllow = false;
      for (const pk of principals) {
        if (wotEngine.getDistance(pk) !== null) { anyAllow = true; break; }
      }
      if (anyAllow) return true;
      // Warm verdicts so unknowns get resolved; the rail re-renders on
      // verdicts-changed if any principal eventually resolves to allow.
      for (const pk of principals) wotEngine.markUnknown(pk);
      return false;
    });
    // `verdictTick` is a dep, not dead weight: the filter reads
    // `wotEngine.getDistance`, which is not part of any other dep. Without it
    // the `verdicts-changed` re-render above returned the memoized list and a
    // resolved verdict never re-admitted its group to the rail.
  }, [all, creators, adminsByGroup, membersByGroup, myPubkey, wotEnabled, verdictTick]);
}

/**
 * Look up a single group by id from the bridge's raw store, bypasses the
 * WoT filter that `useGroups()` applies. Use this whenever the user has
 * explicitly navigated to a specific channel (URL deep-link, sidebar
 * click); WoT-hiding a channel the user is trying to view causes a false
 * "Channel not visible" state in the chat pane. The sidebar list still
 * uses `useGroups()` (filtered), discovery and the explicit-navigation
 * read-path are different operations.
 */
export function useGroupById(groupId: string | null): JsGroup | null {
  const groups = useSubscription<ReadonlyArray<JsGroup>>(
    (b, cb) => b.subscribeGroups(cb),
    [],
    [groupId],
  );
  return useMemo(
    () => (groupId ? groups.find((g) => g.id === groupId) ?? null : null),
    [groups, groupId],
  );
}

export function useGroupMetadataEose(): boolean {
  return useSubscription((b, cb) => b.subscribeGroupMetadataEose(cb), false);
}

export function useChildrenByParent(): Readonly<Record<string, ReadonlyArray<string>>> {
  return useSubscription<Readonly<Record<string, ReadonlyArray<string>>>>((b, cb) => b.subscribeChildrenByParent(cb), {});
}

export function useGroupCreators(): Readonly<Record<string, string>> {
  return useSubscription((b, cb) => b.subscribeGroupCreators(cb), {});
}

/**
 * Pubkey hex of the kind 9007 author for `groupId`, or `null` until the relay
 * has delivered the create-group event. Used by settings/admin paths to
 * decide whether the local user is the creator and should one-shot claim
 * admin via {@link nostrActions.claimCreatorAdmin}.
 */
export function useGroupCreator(groupId: string | null): string | null {
  const all = useSubscription<Readonly<Record<string, string>>>(
    (b, cb) => b.subscribeGroupCreators(cb),
    {},
  );
  if (!groupId) return null;
  return all[groupId] ?? null;
}
