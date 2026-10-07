'use client';

import { useTranslations } from 'next-intl';
import { EMOJI_NAV } from '@/constants/chat/picker';
import { EmojiCategoryButton } from './EmojiCategoryButton';

/** The category bar (hidden while searching). */
export function EmojiCategoryNav({
  activeCategory,
  onJump,
}: {
  activeCategory: string;
  onJump: (category: string) => void;
}) {
  const t = useTranslations();
  return (
    <nav className="mb-2 grid shrink-0 grid-cols-9 border-b border-lc-border px-1 pb-1" aria-label={t('chat.emoji.categories')}>
      {EMOJI_NAV.map((meta) => <EmojiCategoryButton key={meta.name} meta={meta} active={activeCategory === meta.name} onJump={onJump} />)}
    </nav>
  );
}
