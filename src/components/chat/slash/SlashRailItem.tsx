'use client';

import { useTranslations } from 'next-intl';
import { sectionTitle, type BotProfiles, type SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import { keepingFocus } from '@/utils/chat/slash/slash-rows';
import { RailIcon } from './RailIcon';

/** One source in the slash rail: a press filters the list to it, or back to all when it is the filter. */
export function SlashRailItem({ item, botProfiles, onFilter }: {
  item: { section: SlashCommandSection; active: boolean; next: string };
  botProfiles?: BotProfiles;
  onFilter: (filter: string) => void;
}) {
  const t = useTranslations();
  return (
    <button
      type="button"
      title={sectionTitle(item.section, t('chat.slash.recent'), botProfiles)}
      aria-pressed={item.active}
      onMouseDown={keepingFocus(() => onFilter(item.next))}
      className={`rounded-full ring-2 transition-opacity ${item.active ? 'ring-lc-green opacity-100' : 'ring-transparent opacity-70 hover:opacity-100'}`}
      data-testid="slash-rail-item"
    >
      <RailIcon sec={item.section} profiles={botProfiles} />
    </button>
  );
}
