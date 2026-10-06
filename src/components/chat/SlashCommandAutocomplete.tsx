'use client';

import { useRef } from 'react';
import { useTranslation } from '@/i18n/context';
import { RecentIcon } from './picker/RecentIcon';
import { useDismiss } from '@/hooks/useDismiss';
import { botLabel, sectionTitle, type BotProfiles, type SlashCommand, type SlashCommandSection } from './slash/slash-commands';
import { CommandRow, RailIcon } from './slash/SlashRows';
import { useSlashList } from '@/hooks/chat/slash/useSlashList';

export {
  SLASH_COMMANDS,
  type BotProfiles,
  type SlashCommand,
  type SlashCommandParam,
  type SlashCommandSection,
} from './slash/slash-commands';

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
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const { select, registerRef } = useSlashList(onSelect, selectedIndex);
  // Escape stays with the composer, which owns the keyboard while this is open.
  useDismiss({ refs: [ref], onDismiss: onClose, escape: 'ignore' });

  const showRail = !!rail && rail.length > 1 && !!onFilter;
  if (sections.length === 0 && !showRail) return null;

  let flat = 0;
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 flex max-h-96 overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-lg"
      data-testid="slash-autocomplete"
    >
      {showRail && (
        <div className="flex shrink-0 flex-col items-center gap-2 overflow-y-auto overscroll-contain border-r border-lc-border bg-lc-black/40 p-2" data-testid="slash-rail">
          {rail!.map((sec) => {
            const active = filter === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                title={sectionTitle(sec, t('slash.recent'), botProfiles)}
                aria-pressed={active}
                onMouseDown={(e) => { e.preventDefault(); onFilter!(active ? 'all' : sec.key); }}
                className={`rounded-full ring-2 transition-opacity ${active ? 'ring-lc-green opacity-100' : 'ring-transparent opacity-70 hover:opacity-100'}`}
                data-testid="slash-rail-item"
              >
                <RailIcon sec={sec} profiles={botProfiles} />
              </button>
            );
          })}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain [contain:content]">
        {sections.length === 0 && (
          <div className="px-3 py-4 text-xs text-lc-muted">{t('slash.noMatch')}</div>
        )}
        {sections.map((sec) => (
          <div key={sec.key}>
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-lc-dark px-3 pb-1 pt-2 text-xs font-semibold text-lc-white">
              {sec.key === 'recent' && <RecentIcon className="h-4 w-4" />}
              {sectionTitle(sec, t('slash.recent'), botProfiles)}
            </div>
            {sec.commands.map((cmd) => {
              const i = flat++;
              return (
                <CommandRow
                  key={`${sec.key}:${cmd.bot?.pubkey ?? ''}:${cmd.name}`}
                  cmd={cmd}
                  index={i}
                  selected={i === selectedIndex}
                  label={cmd.bot ? botLabel(cmd.bot, botProfiles) : 'Obelisk'}
                  picture={cmd.bot ? botProfiles?.[cmd.bot.pubkey]?.picture : null}
                  onSelect={select}
                  registerRef={registerRef}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
