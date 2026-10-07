'use client';

import { createPortal } from 'react-dom';
import type { JsUserMetadata } from '@/services/nostr-bridge';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { useTranslations } from 'next-intl';
import { MenuDivider, MenuItem, MenuLink } from '@/components/ui/overlays/menu';
import { CopyIcon, EditIcon, ExternalIcon, LogOutIcon } from '@/components/ui/icons/icons';
import RemoteImage from '@/components/ui/media/RemoteImage';

type Props = {
  pubkey: string;
  meta: JsUserMetadata | null;
  displayName: string;
  npub: string | null;
  isMe: boolean;
  style: React.CSSProperties;
  onClose: () => void;
  onEdit: () => void;
  onLogout: () => void;
};

/** The profile popover: banner, avatar, name, about, copy keys, and (for you) edit and log out. */
export function UserProfileCard({ pubkey, meta, displayName, npub, isMe, style, onClose, onEdit, onLogout }: Props) {
  const t = useTranslations();
  return createPortal(
    <>
      <div className="fixed inset-0 z-[65]" onClick={onClose} />
      <div
        style={style}
        className="z-[70] w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-2xl"
      >
        {/* Banner */}
        {meta?.banner ? (
          <div className="h-28 overflow-hidden">
            <RemoteImage src={meta.banner} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-r from-lc-olive/30 to-lc-dark" />
        )}

        {/* Avatar + name */}
        <div className="relative -mt-10 px-5">
          <UserAvatar
            pubkey={pubkey}
            picture={meta?.picture ?? null}
            size={20}
            name={displayName}
            alt={displayName}
            className="ring-4 ring-lc-dark"
            initialClassName="text-2xl"
          />
          <div className="mt-3">
            <div className="text-lg font-semibold text-lc-white">{displayName}</div>
            {meta?.nip05 && <div className="truncate text-xs text-lc-green">{meta.nip05}</div>}
            {npub && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-lc-muted">
                {npub.slice(0, 24)}…
              </div>
            )}
          </div>
        </div>

        {/* About */}
        {meta?.about && (
          <div className="mt-2 px-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
              {t('shell.user.about')}
            </div>
            <div className="mt-0.5 line-clamp-3 text-xs text-lc-muted">{meta.about}</div>
          </div>
        )}

        <div className="mt-3 border-t border-lc-border" />
        {/* The shared menu rows (`menu.tsx`): icon + white label, green-tinted hover, red only for log out. */}
        <div role="menu" aria-label={displayName} className="p-1.5">
          {npub && (
            <MenuItem
              icon={<CopyIcon size={14} />}
              label={t('shell.user.copyNpub')}
              onClick={() => { void navigator.clipboard?.writeText(npub).catch(() => {}); }}
            />
          )}
          <MenuItem
            icon={<CopyIcon size={14} />}
            label={t('shell.user.copyPubkeyHex')}
            onClick={() => { void navigator.clipboard?.writeText(pubkey).catch(() => {}); }}
          />
          {npub && <MenuLink icon={<ExternalIcon size={14} />} label={t('shell.user.openNostrClient')} href={`/p/${npub}`} />}
          {isMe && (
            <>
              <MenuDivider />
              <MenuItem icon={<EditIcon size={14} />} label={t('shell.user.editProfile')} onClick={onEdit} />
              <MenuDivider />
              <MenuItem icon={<LogOutIcon size={14} />} label={t('shell.user.logOut')} onClick={onLogout} danger />
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
