'use client';

/**
 * The ⋯ control in a DM thread header.
 *
 * Everything you could previously do to a conversation lived somewhere else:
 * the peer's profile was behind clicking their name, their npub was only
 * copyable from the profile popover, and muting or blocking meant going to
 * Settings → Muted & blocked and pasting a key. So the header had actions
 * you could see (the protection indicator) and none you could take.
 *
 * Deliberately sits *beside* the protection indicator rather than absorbing
 * it. That indicator reports what the conversation rests on — it is state,
 * not a menu — and burying it one click deep would make the one thing the
 * header says about safety invisible.
 *
 * Mute and block are per-device and local (`useModerationStore`), matching
 * what the settings panel already does; nothing here publishes a NIP-51 list.
 */

import { useRef, useState } from 'react';
import AnchoredMenu from '@/components/social/AnchoredMenu';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useModerationStore } from '@/store/moderation';
import { useTranslation } from '@/i18n/context';
import { hexToNpub } from '@nostr-wot/data';

export default function DMThreadMenu({
  peer,
  onOpenProfile,
  className = '',
}: {
  peer: string;
  onOpenProfile?: (pubkey: string) => void;
  /** Lets each shell position it with its own spacing utilities. */
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Flash "Copied!", then close — the menu staying open after a copy reads
  // as the click not having registered.
  const { copied, copy } = useCopyToClipboard({ onReset: () => setOpen(false) });

  const muted = useModerationStore((s) => s.mutedPubkeys.includes(peer));
  const blocked = useModerationStore((s) => s.blockedPubkeys.includes(peer));
  const toggleMute = useModerationStore((s) => s.toggleMute);
  const toggleBlock = useModerationStore((s) => s.toggleBlock);

  const npub = (() => {
    try {
      return hexToNpub(peer);
    } catch {
      return peer;
    }
  })();

  const item = 'w-full rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-white/5';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lc-muted transition-colors hover:bg-lc-border/40 hover:text-lc-white ${className}`}
        aria-label={t('dm.conversationOptions')}
        title={t('dm.conversationOptions')}
        aria-expanded={open}
        data-testid="dm-thread-menu"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        width={224}
        testId="dm-thread-menu-panel"
      >
        <div className="p-1">
          {onOpenProfile && (
            <button
              type="button"
              className={`${item} text-lc-white`}
              onClick={() => { setOpen(false); onOpenProfile(peer); }}
              data-testid="dm-menu-profile"
            >
              {t('dm.viewProfile')}
            </button>
          )}
          <button
            type="button"
            className={`${item} text-lc-white`}
            onClick={() => void copy(npub)}
            data-testid="dm-menu-copy-npub"
          >
            {copied ? t('common.copied') : t('user.copyNpub')}
          </button>

          <div className="my-1 h-px bg-lc-border" aria-hidden="true" />

          <button
            type="button"
            className={`${item} text-lc-white`}
            onClick={() => { toggleMute(peer); setOpen(false); }}
            data-testid="dm-menu-mute"
          >
            {t(muted ? 'profileFeed.unmute' : 'profileFeed.mute')}
          </button>
          {/* Destructive last and in red, so it can't be hit on the way to
              something harmless. */}
          <button
            type="button"
            className={`${item} text-red-400 hover:bg-red-500/10`}
            onClick={() => { toggleBlock(peer); setOpen(false); }}
            data-testid="dm-menu-block"
          >
            {t(blocked ? 'profileFeed.unblock' : 'profileFeed.block')}
          </button>
        </div>
      </AnchoredMenu>
    </>
  );
}
