'use client';

import { useRef } from 'react';
import { useDismiss } from '@/hooks/common/useDismiss';
import type { BotProfiles, SlashCommand, SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import { slashRailItems, slashSectionRows } from '@/utils/chat/slash/slash-rows';
import { useSlashList } from './useSlashList';

/**
 * The slash list's view model: its sections with rows numbered across them,
 * the source rail (shown when there is more than one source to filter by),
 * the stable row callbacks, and closing on a press outside. Escape stays
 * with the composer, which owns the keyboard while the list is open.
 */
export function useSlashCommandAutocomplete({ sections, rail, filter, onFilter, selectedIndex, onSelect, onClose, botProfiles }: {
  sections: ReadonlyArray<SlashCommandSection>;
  rail?: ReadonlyArray<SlashCommandSection>;
  filter: string;
  onFilter?: (filter: string) => void;
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  botProfiles?: BotProfiles;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { select, registerRef } = useSlashList(onSelect, selectedIndex);
  useDismiss({ refs: [ref], onDismiss: onClose, escape: 'ignore' });
  const showRail = !!rail && rail.length > 1 && !!onFilter;
  return {
    ref,
    select,
    registerRef,
    showRail,
    groups: slashSectionRows(sections, botProfiles),
    railItems: showRail ? slashRailItems(rail, filter) : [],
    setFilter: (next: string) => onFilter?.(next),
  };
}
