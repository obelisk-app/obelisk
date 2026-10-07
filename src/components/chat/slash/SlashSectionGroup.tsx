'use client';

import { useTranslations } from 'next-intl';
import { RecentIcon } from '../picker/RecentIcon';
import { sectionTitle, type BotProfiles, type SlashCommand, type SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import type { SlashRow } from '@/utils/chat/slash/slash-rows';
import { CommandRow } from './CommandRow';

/** One source's commands in the slash list, under a sticky title. */
export function SlashSectionGroup({ section, rows, selectedIndex, botProfiles, onSelect, registerRef }: {
  section: SlashCommandSection;
  rows: ReadonlyArray<SlashRow>;
  selectedIndex: number;
  botProfiles?: BotProfiles;
  onSelect: (cmd: SlashCommand) => void;
  registerRef: (index: number, el: HTMLButtonElement | null) => void;
}) {
  const t = useTranslations();
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-lc-dark px-3 pb-1 pt-2 text-xs font-semibold text-lc-white">
        {section.key === 'recent' && <RecentIcon className="h-4 w-4" />}
        {sectionTitle(section, t('chat.slash.recent'), botProfiles)}
      </div>
      {rows.map((row) => (
        <CommandRow
          key={row.key}
          cmd={row.cmd}
          index={row.index}
          selected={row.index === selectedIndex}
          label={row.botLabel ?? 'Obelisk'}
          picture={row.picture}
          onSelect={onSelect}
          registerRef={registerRef}
        />
      ))}
    </div>
  );
}
