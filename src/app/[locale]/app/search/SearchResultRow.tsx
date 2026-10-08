'use client';

import Button from '@/components/ui/buttons/Button';
import type { JsSearchHit } from '@/services/nostr-bridge';
import { useSearchResultRow } from '@/hooks/shell/search/useSearchResultRow';
import type { Translate } from '@/i18n/keys';

/** One message hit: author (a filter on them), channel, time, and the message, which jumps to it. */
export function SearchResultRow({ id, active, msg, groupName, t, onJump, onAuthor }: {
  id: string;
  active: boolean;
  msg: JsSearchHit;
  groupName: string | null;
  t: Translate;
  onJump: () => void;
  onAuthor: (pk: string) => void;
}) {
  const row = useSearchResultRow(msg, groupName);
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      data-testid="search-result-row"
      className={
        'px-3 py-2 border-b border-lc-border/40 last:border-b-0 ' +
        (active ? 'bg-lc-card' : 'hover:bg-lc-card')
      }
    >
      <div className="flex items-baseline gap-2 text-xs">
        <Button variant="bare" onClick={() => onAuthor(msg.pubkey)} className="font-semibold text-lc-white hover:underline truncate">{row.name}</Button>
        <span className="text-lc-muted">{t('shell.search.in')}</span>
        <span className="text-lc-green truncate">#{row.channel}</span>
        <span className="ml-auto text-[10px] text-lc-muted">
          {row.time}
        </span>
      </div>
      <Button variant="bare" onClick={onJump} className="mt-0.5 block w-full text-left text-sm text-lc-white/90 line-clamp-2">{msg.content}</Button>
    </div>
  );
}
