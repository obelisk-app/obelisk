'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAdminsByGroup,
  useGroupCreators,
  useMembersByGroup,
  type JsGroup,
} from '@/services/nostr-bridge';
import { wotEngine } from '@/services/wot';
import { useWotEnabled } from '@/hooks/wot/useWot';
import { useRelayOperatorData } from '@/hooks/app/useRelayOperatorData';
import { groupDistances } from '@/app/app/panes/sidebar/group-distance';

/**
 * The desktop sidebar's view of the operator data: the shared
 * `useRelayOperatorData`, plus two desktop-only pieces, the WoT operator
 * exemption and the title's skeleton grace.
 */
export function useSidebarOperatorData(relay: string) {
  const operator = useRelayOperatorData(relay);
  const { operatorPubkey } = operator;
  // Push the relay operator into the WoT engine so useGroups exempts the
  // operator from filtering on their own relay. Updated whenever the active
  // relay or its NIP-11 advertisement changes.
  useEffect(() => {
    wotEngine.setOperatorPubkeys(operatorPubkey ? [operatorPubkey] : []);
  }, [operatorPubkey]);
  // 1500ms grace period for the title, keeps a skeleton in place while
  // we wait for branding. If nothing arrives by then, fall back to the
  // shortHost() label so the user isn't staring at shimmer forever.
  // The grace stamp is keyed on the relay: switching relays starts a new
  // window with no reset step, and once branding has arrived the stamp is
  // irrelevant anyway.
  const [graceElapsedFor, setGraceElapsedFor] = useState<string | null>(null);
  const brandingLoaded = operator.branding.updatedAt > 0;
  useEffect(() => {
    if (brandingLoaded) return;
    const t = setTimeout(() => setGraceElapsedFor(relay), 1500);
    return () => clearTimeout(t);
  }, [brandingLoaded, relay]);
  const showTitleSkeleton = !brandingLoaded && graceElapsedFor !== relay;

  return { ...operator, brandingLoaded, showTitleSkeleton };
}

/** Per-channel WoT distance for the channel-name colours, recomputed as verdicts resolve. */
export function useGroupWotDistances(groups: ReadonlyArray<JsGroup>) {
  const adminsByGroup = useAdminsByGroup();
  const membersByGroup = useMembersByGroup();
  const creatorsByGroup = useGroupCreators();
  const wotEnabled = useWotEnabled();
  // Re-render the rail when verdicts resolve so channel-name colors update.
  const [, forceWotRerender] = useState(0);
  useEffect(() => {
    if (!wotEnabled) return;
    return wotEngine.on('verdicts-changed', () => forceWotRerender((n) => n + 1));
  }, [wotEnabled]);
  return useMemo(() => {
    if (!wotEnabled) return {};
    return groupDistances(groups, creatorsByGroup, adminsByGroup, membersByGroup, (pk) => wotEngine.getDistance(pk));
  }, [wotEnabled, groups, creatorsByGroup, adminsByGroup, membersByGroup]);
}
