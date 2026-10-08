'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { MENU_PANEL_CLASS, MenuItem } from '@/components/ui/overlays/menu';
import { useRepostButton } from '@/hooks/social/note/useRepostButton';
import AnchoredMenu from '../../common/AnchoredMenu';
import ActionButton from './ActionButton';
import { QuoteIcon, RepostIcon } from '@/assets/icons';

/**
 * Repost with a Quote option. A plain button can't offer both, and hiding
 * quote behind a right-click meant touch users had no way to reach it.
 * Repost opens a two-item menu, matching what every other Nostr client does.
 */
export default function RepostButton({
  count,
  active,
  disabled,
  onRepost,
  onQuote,
}: {
  count: number;
  active?: boolean;
  disabled?: boolean;
  onRepost: () => void;
  onQuote?: () => void;
}) {
  const t = useTranslations();
  const wrapRef = useRef<HTMLDivElement>(null);
  const menu = useRepostButton({ onRepost, onQuote });

  // With no quote handler there's nothing to choose between, so stay a
  // one-tap button rather than opening a single-item menu.
  if (!onQuote) {
    return (
      <ActionButton
        kind="repost"
        label={t('social.repost')}
        icon={<RepostIcon size={18} />}
        count={count}
        testId="note-repost"
        active={active}
        disabled={disabled}
        onClick={onRepost}
      />
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <ActionButton
        kind="repost"
        label={t('social.repost')}
        icon={<RepostIcon size={18} />}
        count={count}
        testId="note-repost"
        active={active}
        disabled={disabled}
        onClick={menu.toggle}
      />
      {/*
        Portalled for the same reason as the ⋯ menu: a note card's
        `contain: paint` clips and stacking-traps anything positioned inside
        it, so this would render under the next card.
      */}
      <AnchoredMenu
        open={menu.open}
        onClose={menu.close}
        anchorRef={wrapRef}
        width={150}
        align="start"
        testId="note-repost-menu"
        panelClassName={MENU_PANEL_CLASS}
      >
        <MenuItem
          icon={<RepostIcon size={18} />}
          label={t('social.repost')}
          onClick={menu.repost}
          testId="note-repost-confirm"
        />
        <MenuItem
          icon={<QuoteIcon size={18} />}
          label={t('social.quote')}
          onClick={menu.quote}
          testId="note-quote"
        />
      </AnchoredMenu>
    </div>
  );
}
