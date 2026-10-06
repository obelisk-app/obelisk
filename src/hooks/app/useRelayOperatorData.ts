'use client';

import { useEffect, useMemo } from 'react';
import { useMediaPacks, useMyPubkey } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { relayOperatorAuthors } from '@/services/channel-layout';
import { useChannelLayout } from '@/hooks/relay/useChannelLayout';
import { useRelayOperatorPubkey } from '@/hooks/relay/useRelayOperatorPubkey';
import { useRelayBranding } from '@/hooks/relay/useRelayBranding';
import { relayEmojiMap, relayMediaKindMap, resolveRelayEmojiSet } from '@/services/relay-emojis';
import { useRelayEmojiSet } from '@/hooks/relay/useRelayEmojiSet';
import { rolesByPubkey } from '@/services/relay-roles';
import { useRelayRoles } from '@/hooks/relay/useRelayRoles';

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
