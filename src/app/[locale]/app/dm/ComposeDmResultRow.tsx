'use client';

import Button from '@/components/ui/buttons/Button';
import type { UserHit } from '@/constants/identity/user-search';
import { useComposeDmResultRow } from '@/hooks/shell/dm/useComposeDmResultRow';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { CheckBadgeIcon } from '@/assets/icons';

/** One person in the desktop "New message" results. */
export function ComposeDmResultRow({ hit, active, onPick, onHover }: { hit: UserHit; active: boolean; onPick: () => void; onHover: () => void }) {
  const row = useComposeDmResultRow(hit);
  return (
    <Button
      variant="bare"
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${active ? 'bg-lc-green/15' : 'hover:bg-white/5'}`}
      data-testid="dm-compose-result"
    >
      <UserAvatar pubkey={hit.pubkey} picture={row.picture} name={row.name} size={8} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-lc-white">{row.name}</span>
        <span
          className={`flex items-center gap-1 text-[11px] ${row.verified ? 'text-lc-green' : 'text-lc-muted'}`}
          data-testid="dm-compose-result-sub"
          data-nip05-state={row.nip05State}
        >
          {row.verified && <CheckBadgeIcon size={11} />}
          <span className="truncate">{row.sub}</span>
        </span>
      </span>
    </Button>
  );
}
