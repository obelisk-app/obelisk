'use client';

import type { RefObject } from 'react';
import { useFeedFloatingControls } from '@/hooks/social/feed/useFeedFloatingControls';
import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';

/**
 * Back-to-top and the compose button, floating over the feed scroller.
 *
 * Bottom-right rather than bottom-left: the profile bar lives bottom-left
 * on desktop, and the mobile bottom-nav sits under this, hence the
 * larger offset there.
 */
export default function FeedFloatingControls({
  showBackToTop,
  showCompose,
  pendingCount,
  mobile,
  scrollRef,
  onShowPending,
  onCompose,
}: {
  showBackToTop: boolean;
  showCompose: boolean;
  pendingCount: number;
  mobile: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onShowPending: () => void;
  onCompose: () => void;
}) {
  const t = useTranslations();
  const { backToTop } = useFeedFloatingControls({ scrollRef, onShowPending });
  return (
    <>
      {/*
        Back to the newest note. Scrolling up to the very top and holding a
        pull is the only way the live tail merged, which on a phone meant a
        reader a few screens down had no way to reach new notes at all: the
        pending pill lives at the top of the list, where they weren't. This
        both reports the count and takes them there.
      */}
      {showBackToTop && (
        <button
          type="button"
          onClick={backToTop}
          aria-label={t('social.backToTop')}
          title={t('social.backToTop')}
          className={`absolute right-5 z-20 flex h-11 items-center justify-center gap-1.5 rounded-full border border-lc-border bg-lc-dark/95 px-3 text-xs font-semibold text-lc-white shadow-2xl shadow-black/50 backdrop-blur transition hover:border-lc-green/40 active:scale-95 ${
            pendingCount > 0 ? 'border-lc-green/60 text-lc-green' : ''
          } bottom-24`}
          data-testid="feed-back-to-top"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
          </svg>
          {pendingCount > 0 && <span>{pendingCount}</span>}
        </button>
      )}

      {showCompose && (
        <IconButton
          tone="primary"
          size="14"
          onClick={onCompose}
          aria-label={t('social.profileFeed.createPost')}
          title={t('social.profileFeed.createPost')}
          className={`absolute right-5 z-20 shadow-2xl shadow-black/50 active:scale-95 ${mobile ? 'bottom-6' : 'bottom-5'}`}
          data-testid="feed-compose-fab"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
        </IconButton>
      )}
    </>
  );
}
