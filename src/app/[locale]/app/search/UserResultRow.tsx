'use client';

import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import type { UserHit } from '@/constants/identity/user-search';
import { useUserResultRow } from '@/hooks/shell/search/useUserResultRow';
import { CheckBadgeIcon } from '@/assets/icons';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One person in the search dropdown: picture or initial, name, how they were found, and their handle. */
export function UserResultRow({ hit, badge, onPick }: { hit: UserHit; badge?: string; onPick: () => void }) {
  const row = useUserResultRow(hit);
  return (
    <Button
      variant="bare"
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-lc-card border-b border-lc-border/40 last:border-b-0"
      data-testid="search-user-row"
      data-pubkey={hit.pubkey}
    >
      {hit.picture ? (
        <RemoteImage src={hit.picture} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-7 h-7 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
          {row.initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Row gap="1.5" align="center">
          <span className="text-sm text-lc-white truncate">{row.name}</span>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-lc-green/15 text-lc-green border border-lc-green/30 shrink-0">
              {badge}
            </span>
          )}
        </Row>
        <div
          className={`flex items-center gap-1 text-[11px] ${row.verified ? 'text-lc-green' : 'text-lc-muted'}`}
          data-testid="search-user-sub"
          data-nip05-state={row.nip05State}
        >
          {row.verified && <CheckBadgeIcon size={11} />}
          <span className="truncate">{row.sub}</span>
        </div>
      </div>
    </Button>
  );
}
