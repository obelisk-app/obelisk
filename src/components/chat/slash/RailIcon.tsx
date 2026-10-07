'use client';

import ObeliskIcon from '@/components/ui/icons/ObeliskIcon';
import type { BotProfiles, SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import { RecentIcon } from '../picker/RecentIcon';
import { BotAvatar } from './BotAvatar';

/** A source's icon in the slash rail: recent, Obelisk, or the bot's picture. */
export function RailIcon({ sec, profiles }: { sec: SlashCommandSection; profiles?: BotProfiles }) {
  if (sec.key === 'recent') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-border text-lc-white"><RecentIcon /></span>;
  if (sec.key === 'obelisk') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-black text-lc-green"><ObeliskIcon className="h-6 w-6" /></span>;
  return <BotAvatar picture={profiles?.[sec.key]?.picture} size="md" />;
}
