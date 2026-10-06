'use client';

import { useEffect, useState } from 'react';
import { useMyPubkey, useUserMetadata as useProfile } from '@/services/nostr-bridge';
import { onOpenSettings, revealSettingsSection, type SettingsSection } from '@/utils/open-settings';
import UserPanel from '../UserPanel';
import { GearIcon } from '@/components/ui/icons';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useChatStore } from '@/store/chat';
import { useTranslations } from 'next-intl';
import { Avatar } from '../Avatar';

export function SidebarMe({ collapsible = false }: { collapsible?: boolean }) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const meta = useProfile(myPubkey);
  const [editing, setEditing] = useState(false);
  /* Set when the panel was opened by a "manage these" request rather than by
     the gear, so it lands on preferences and scrolls to the right block. */
  const [pendingSection, setPendingSection] = useState<SettingsSection | null>(null);

  useEffect(() => onOpenSettings(({ section }) => {
    setPendingSection(section);
    setEditing(true);
    revealSettingsSection(section);
  }), []);
  // The gear is "preferences"; editing the profile is on the profile card.
  const openPreferences = () => { setPendingSection('general'); setEditing(true); };

  if (!myPubkey) return null;
  // Reveal on the PARENT's hover (`group/me`), not this element's, so the
  // whole bar is one target - expanding only when the pointer happens to
  // land on the avatar would feel broken.
  const revealed = collapsible
    ? 'hidden group-hover/me:flex group-focus-within/me:flex'
    : 'flex';
  return (
    <div className="relative flex w-full items-center gap-2">
      <button
        type="button"
        onClick={(event) => useChatStore.getState().openProfilePopup(myPubkey, { x: event.clientX, y: event.clientY })}
        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-lc-card/50"
        title={t('shell.desktop.me.profile')}
        data-testid="sidebar-profile-button"
        data-tour="profile-button"
      >
        <Avatar pubkey={myPubkey} size={8} picture={meta?.picture ?? null} />
        <div className={`min-w-0 flex-1 flex-col ${revealed}`}>
          <div className="truncate text-sm font-semibold text-lc-white">
            {meta?.displayName || meta?.name || 'You'}
          </div>
          {/* NIP-05 when there is one, else a short npub - never raw hex. */}
          <div className="truncate text-[11px] text-lc-muted" data-testid="sidebar-profile-handle">
            {meta?.nip05 ? meta.nip05.replace(/^_@/, '') : shortNpubLabel(myPubkey)}
          </div>
        </div>
      </button>
      <button
        onClick={openPreferences}
        className={`shrink-0 rounded-md p-1.5 text-lc-white/80 transition-colors hover:bg-lc-green/15 hover:text-lc-green ${
          collapsible ? 'hidden group-hover/me:block group-focus-within/me:block' : ''
        }`}
        title={t('settings.openPreferences')}
        aria-label={t('settings.openPreferences')}
        data-testid="user-settings-button"
      >
        <GearIcon size={18} />
      </button>
      {editing && (
        <UserPanel
          pubkey={myPubkey}
          isMe
          initialEditing
          initialTab={pendingSection ?? 'profile'}
          onClose={() => { setEditing(false); setPendingSection(null); }}
        />
      )}
    </div>
  );
}

// -- Chat layout (chat + member list) -----------------------------------
