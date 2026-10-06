import { useEffect, useMemo, useState } from 'react';
import { getBridgeImpl, type JsUserMetadata } from '@/services/nostr-bridge';
import { buildSlashSections, mergeSlashCommands, useBotCommands, type SlashFilter } from '@/services/bot-commands';
import { loadRecentSlashCommands } from '@/services/recent-slash-commands';
import { SLASH_COMMANDS, type BotProfiles, type SlashCommand } from '@/components/chat/SlashCommandAutocomplete';

/**
 * What the slash picker shows for `slashQuery`: built-ins (/zap, /play)
 * first, then the commands of bots alive on this relay, sectioned, with the
 * filter rail, the recent list, and each bot's name and picture.
 */
export function useSlashCatalog(relay: string, slashQuery: string | null, metaMap: Record<string, JsUserMetadata>) {
  const botCommandSets = useBotCommands(relay);
  const allSlashCommands = useMemo(() => mergeSlashCommands(SLASH_COMMANDS, botCommandSets), [botCommandSets]);
  const [slashFilter, setSlashFilterState] = useState<SlashFilter>('all');
  const [recentSlash, setRecentSlash] = useState<string[]>(() => loadRecentSlashCommands());
  const slashSections = useMemo(
    () => slashQuery === null ? [] : buildSlashSections(allSlashCommands, slashQuery, recentSlash, slashFilter),
    [slashQuery, allSlashCommands, recentSlash, slashFilter],
  );
  const slashOpen = slashQuery !== null;
  const slashRail = useMemo(
    () => slashOpen ? buildSlashSections(allSlashCommands, '', recentSlash) : [],
    [slashOpen, allSlashCommands, recentSlash],
  );
  const slashResults = useMemo<SlashCommand[]>(() => slashSections.flatMap((sec) => sec.commands), [slashSections]);
  // One kind 0 lookup per bot (not per row); names/pictures come from metaMap.
  const botPubkeysKey = botCommandSets.map((b) => b.pubkey).sort().join(',');
  useEffect(() => {
    if (!botPubkeysKey) return;
    const impl = getBridgeImpl();
    if (!impl) return;
    const unsubs = botPubkeysKey.split(',').map((pk) => impl.subscribeUserMetadata(pk, () => {}));
    return () => { unsubs.forEach((u) => u()); };
  }, [botPubkeysKey]);
  // Keyed on the bots' own name/picture so unrelated kind 0 traffic does
  // not rebuild the picker.
  const botProfilesKey = (botPubkeysKey ? botPubkeysKey.split(',') : [])
    .map((pk) => `${pk}\t${metaMap[pk]?.displayName || metaMap[pk]?.name || ''}\t${metaMap[pk]?.picture || ''}`)
    .join('\n');
  const botProfiles = useMemo<BotProfiles>(() => {
    const out: Record<string, { name?: string | null; picture?: string | null }> = {};
    for (const line of botProfilesKey ? botProfilesKey.split('\n') : []) {
      const [pk, name, picture] = line.split('\t');
      out[pk] = { name: name || null, picture: picture || null };
    }
    return out;
  }, [botProfilesKey]);

  return { slashSections, slashRail, slashResults, slashFilter, setSlashFilterState, setRecentSlash, botProfiles };
}
