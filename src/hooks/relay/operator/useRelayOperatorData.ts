'use client';

import { useEffect, useMemo } from 'react';
import { useMediaPacks } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useChatStore } from '@/store/chat';
import { relayOperatorAuthors } from '@/services/relay/channel-layout';
import { useChannelLayout } from '@/hooks/relay/channel-layout/useChannelLayout';
import { useRelayOperatorPubkey } from '@/hooks/relay/operator/useRelayOperatorPubkey';
import { useRelayBranding } from '@/hooks/relay/branding/useRelayBranding';
import { relayEmojiMap, relayMediaKindMap, resolveRelayEmojiSet } from '@/services/relay/relay-emojis';
import { useRelayEmojiSet } from '@/hooks/relay/operator/useRelayEmojiSet';
import { rolesByPubkey } from '@/services/relay/relay-roles';
import { useRelayRoles } from '@/hooks/relay/operator/useRelayRoles';

/**
 * The relay's operator-published data, shared by both shells (the desktop
 * sidebar and the phone's server screen): the channel layout, branding,
 * emoji set and roles, all authored by the relay operator alone. A channel
 * admin must not gain relay-wide settings authority.
 *
 * Roles and the resolved emoji set are fanned into the chat store here, once,
 * so message rows and the member list read them without opening their own
 * REQs. Two copies of this used to live in the two shells.
 */
export function useRelayOperatorData(relay: string) {
  const myPubkey = useMyPubkey();
  const operatorPubkey = useRelayOperatorPubkey(relay || null);
  const relayAuthors = useMemo(() => relayOperatorAuthors(operatorPubkey), [operatorPubkey]);
  const layout = useChannelLayout(relay || null, relayAuthors);
  const isRelayOperator = !!myPubkey && myPubkey === operatorPubkey;
  const branding = useRelayBranding(relay || null, relayAuthors);
  const emojiSet = useRelayEmojiSet(relay || null, relayAuthors);
  const relayRoles = useRelayRoles(relay || null, relayAuthors);
  const setRolesByPubkey = useChatStore((s) => s.setRolesByPubkey);
  useEffect(() => {
    setRolesByPubkey(rolesByPubkey(relayRoles));
  }, [relayRoles, setRolesByPubkey]);
  const mediaPacks = useMediaPacks();
  const resolvedEmojiSet = useMemo(() => resolveRelayEmojiSet(emojiSet, mediaPacks), [emojiSet, mediaPacks]);
  const setServerEmojis = useChatStore((s) => s.setServerEmojis);
  useEffect(() => {
    setServerEmojis(relayEmojiMap(resolvedEmojiSet), relayMediaKindMap(resolvedEmojiSet));
  }, [resolvedEmojiSet, setServerEmojis]);

  return { operatorPubkey, isRelayOperator, layout, branding, emojiSet, relayRoles };
}
