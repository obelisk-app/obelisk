'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useChatStore } from '@/store/chat';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useNip05Status } from '@/hooks/identity/useNip05Status';
import { useDismiss } from '@/hooks/common/useDismiss';
import { copyWithToast } from '@/services/common/clipboard';
import { displayNameFor } from '@/utils/identity/display-name';
import { popoverShortNpub } from '@/utils/identity/profile-labels';
import { safeNpub } from '@/utils/identity/short-npub';
import { usePopoverMember } from './usePopoverMember';
import { requestZapPrefill } from '@/services/chat/profile/zap-prefill';
import { usePopoverPlacement } from './usePopoverPlacement';

/**
 * The profile card's view model: who it shows (relay membership with kind 0),
 * whether it is the reader's own card, the handle's verification, where it
 * sits (beside the click, or centred), Escape to close, and the zap and
 * copy-npub actions.
 */
export function useProfilePopover(pubkey: string, onClose: () => void) {
  const t = useTranslations();
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const anchor = useChatStore((s) => s.profilePopupAnchor);
  const member = usePopoverMember(pubkey);
  const panelRef = useRef<HTMLDivElement>(null);
  const isSelf = useMyPubkey() === pubkey;
  // `verify` mode: the reader opened this person, so one request to the
  // domain they named is theirs to make. List rows elsewhere only peek.
  const nip05State = useNip05Status(pubkey, member?.nip05, 'verify');

  useDismiss({ onDismiss: onClose, outside: 'none' });
  usePopoverPlacement(panelRef, anchor);

  // `safeNpub` hands the hex back when bech32 encoding throws; the card
  // then has no npub to copy.
  const encoded = safeNpub(pubkey);
  const npub = encoded === pubkey ? '' : encoded;
  // Never the raw 64-char hex: when bech32 encoding threw, this popover
  // printed the whole pubkey as the person's name.
  const displayName = member?.displayName || displayNameFor(pubkey);
  const npubShort = npub ? popoverShortNpub(pubkey) : pubkey;

  return {
    serverEmojis,
    anchor,
    member,
    panelRef,
    isSelf,
    nip05State,
    npub,
    npubShort,
    displayName,
    /** Prefill a zap in the open channel; without one there is nowhere to send it and the card stays. */
    zap: () => {
      if (requestZapPrefill(pubkey, displayName)) onClose();
    },
    copyNpub: () => copyWithToast(npub, t('social.profileFeed.npubCopied'), npubShort),
  };
}
