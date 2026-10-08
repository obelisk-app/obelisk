'use client';

import Button from '@/components/ui/buttons/Button';
import type { JsGroup } from '@/services/nostr-bridge';
import { useChannelsSection } from '@/hooks/shell/search/useChannelsSection';
import RemoteImage from '@/components/ui/media/RemoteImage';
import type { Translate } from '@/i18n/keys';

/** The channels whose name matches the typed query; picking one opens it. */
export function ChannelsSection({ matches, t, onClose }: { matches: ReadonlyArray<JsGroup>; t: Translate; onClose: () => void }) {
  const vm = useChannelsSection(matches, onClose);
  if (matches.length === 0) return null;
  return (
    <section data-testid="search-channels-section">
      <div className="flex items-center px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{t('shell.search.channels')}</span>
      </div>
      {vm.shown.map((g) => (
        <Button
          variant="bare"
          key={g.id}
          type="button"
          onClick={() => vm.pick(g)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-lc-card border-b border-lc-border/40 last:border-b-0"
          data-testid="search-channel-row"
          data-group-id={g.id}
        >
          {g.picture ? (
            <RemoteImage src={g.picture} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
          ) : (
            <div className="w-7 h-7 rounded-md bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
              #
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm text-lc-white truncate">#{g.name ?? g.id.slice(0, 8)}</div>
            {g.about && <div className="text-[11px] text-lc-muted truncate">{g.about}</div>}
          </div>
        </Button>
      ))}
    </section>
  );
}
