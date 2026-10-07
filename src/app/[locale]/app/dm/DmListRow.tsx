'use client';

import type { JsDirectMessage } from '@/services/nostr-bridge';
import { useDmListRow } from '@/hooks/shell/dm/useDmListRow';
import UserAvatar from '@/components/ui/media/UserAvatar';

/** One conversation in the desktop DM list: avatar, name, unread count and the last message. */
export function DmListRow({
  pubkey,
  last,
  youPrefix,
  active,
  onClick,
}: {
  pubkey: string;
  last: JsDirectMessage | undefined;
  youPrefix: string;
  active: boolean;
  onClick: () => void;
}) {
  const row = useDmListRow(pubkey, last, youPrefix);
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ' +
        (active ? 'bg-lc-border/40' : 'hover:bg-lc-border/20')
      }
    >
      <UserAvatar pubkey={pubkey} size={8} picture={row.picture} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className={
              'truncate text-sm ' +
              (row.unread ? 'font-bold text-lc-white' : 'font-medium text-lc-white')
            }
          >
            {row.name}
          </span>
          {row.unread && (
            <span className="shrink-0 rounded-full bg-lc-green px-1.5 py-px text-[10px] font-bold text-lc-black">
              {row.unreadLabel}
            </span>
          )}
        </div>
        {row.preview && (
          <p
            className={
              'truncate text-xs ' + (row.unread ? 'text-lc-white' : 'text-lc-muted')
            }
          >
            {row.preview}
          </p>
        )}
      </div>
    </button>
  );
}
