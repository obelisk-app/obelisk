import { useRef, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useConcordBranding } from './useConcordBranding';
import { useConcordClient } from './useConcordClient';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';
import { confirmAndLeaveConcord } from '@/services/chat/concord/leave';

export function useConcordRailTile(community: ConcordCommunity, onClick: () => void) {
  const t = useTranslations();
  const { client } = useConcordClient();
  const { branding } = useConcordBranding(community, false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const { copy, copied } = useCopyToClipboard();
  return {
    branding, anchorRef, menu, copied: copied !== null,
    openMenu: (event: MouseEvent) => { event.preventDefault(); setMenu(true); },
    closeMenu: () => setMenu(false),
    switchTo: () => { setMenu(false); onClick(); },
    copyId: () => { void copy(community.communityId); },
    leave: () => { setMenu(false); if (client) void confirmAndLeaveConcord(client, community, branding.name, t); },
  };
}
