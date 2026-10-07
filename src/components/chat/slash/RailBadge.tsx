'use client';

import ObeliskIcon from '@/assets/brand/ObeliskIcon';
import type { BotProfiles, SlashCommandSection } from '@/utils/chat/slash/slash-commands';
import { BotAvatar } from './BotAvatar';
import { RecentIcon } from '@/assets/icons';

/** A source's icon in the slash rail: recent, Obelisk, or the bot's picture. */
export function RailBadge({ sec, profiles }: { sec: SlashCommandSection; profiles?: BotProfiles }) {
  if (sec.key === 'recent') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-border text-lc-white"><RecentIcon size={null} data-testid="recent-icon" className="h-5 w-5" /></span>;
  if (sec.key === 'obelisk') return <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lc-black text-lc-green"><ObeliskIcon className="h-6 w-6" /></span>;
  return <BotAvatar picture={profiles?.[sec.key]?.picture} size="md" />;
}
