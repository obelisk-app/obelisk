'use client';

import Button from '@/components/ui/buttons/Button';
import type { RefObject } from 'react';
import { useFeedFloatingControls } from '@/hooks/social/feed/useFeedFloatingControls';
import { useTranslations } from 'next-intl';
import IconButton from '@/components/ui/buttons/IconButton';
import { ArrowUpIcon, PlusIcon } from '@/assets/icons';

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
        <Button
          variant="bare"
          type="button"
          onClick={backToTop}
          aria-label={t('social.backToTop')}
          title={t('social.backToTop')}
          className={`absolute right-5 z-20 flex h-11 items-center justify-center gap-1.5 rounded-full border border-lc-border bg-lc-dark/95 px-3 text-xs font-semibold text-lc-white shadow-2xl shadow-black/50 backdrop-blur transition hover:border-lc-green/40 active:scale-95 ${
            pendingCount > 0 ? 'border-lc-green/60 text-lc-green' : ''
          } bottom-24`}
          data-testid="feed-back-to-top"
        >
          <ArrowUpIcon size={18} strokeWidth={2.5} />
          {pendingCount > 0 && <span>{pendingCount}</span>}
        </Button>
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
          <PlusIcon size={24} strokeWidth={2.5} />
        </IconButton>
      )}
    </>
  );
}
