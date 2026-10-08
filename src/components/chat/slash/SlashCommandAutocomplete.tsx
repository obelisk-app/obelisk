'use client';

import Stack from '@/components/ui/layout/Stack';
import { useTranslations } from 'next-intl';
import type { BotProfiles, SlashCommand, SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import { useSlashCommandAutocomplete } from '@/hooks/chat/slash/useSlashCommandAutocomplete';
import { SlashRailItem } from './SlashRailItem';
import { SlashSectionGroup } from './SlashSectionGroup';

interface Props {
  /** Sections to list (already narrowed by `filter`). */
  sections: SlashCommandSection[];
  /** Every source, for the left rail, independent of query and filter. */
  rail?: SlashCommandSection[];
  filter?: string;
  onFilter?: (filter: string) => void;
  /** Index into the flattened `sections` commands. */
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  botProfiles?: BotProfiles;
}

export default function SlashCommandAutocomplete({
  sections, rail, filter = 'all', onFilter, selectedIndex, onSelect, onClose, botProfiles,
}: Props) {
  const t = useTranslations();
  const { ref, select, registerRef, showRail, groups, railItems, setFilter } = useSlashCommandAutocomplete({
    sections, rail, filter, onFilter, selectedIndex, onSelect, onClose, botProfiles,
  });
  if (sections.length === 0 && !showRail) return null;

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 flex max-h-96 overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-lg"
      data-testid="slash-autocomplete"
    >
      {showRail && (
        <Stack gap="2" align="center" className="shrink-0 overflow-y-auto overscroll-contain border-r border-lc-border bg-lc-black/40 p-2" data-testid="slash-rail">
          {railItems.map((item) => <SlashRailItem key={item.section.key} item={item} botProfiles={botProfiles} onFilter={setFilter} />)}
        </Stack>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain [contain:content]">
        {sections.length === 0 && (
          <div className="px-3 py-4 text-xs text-lc-muted">{t('chat.slash.noMatch')}</div>
        )}
        {groups.map((group) => (
          <SlashSectionGroup
            key={group.section.key}
            section={group.section}
            rows={group.rows}
            selectedIndex={selectedIndex}
            botProfiles={botProfiles}
            onSelect={select}
            registerRef={registerRef}
          />
        ))}
      </div>
    </div>
  );
}
