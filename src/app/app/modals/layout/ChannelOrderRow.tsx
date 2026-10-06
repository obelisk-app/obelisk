'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { ChevronRightIcon } from '@/components/ui/icons';

/** One channel in the layout editor: drag handle, category picker, up/down. */
export function ChannelOrderRow({
  channel,
  bucket,
  first,
  last,
  categories,
  onMove,
  onChangeCategory,
  onGrab,
  onDragEnd,
  onDropBefore,
}: {
  channel: JsGroup | undefined;
  bucket: string | null;
  first: boolean;
  last: boolean;
  categories: ReadonlyArray<{ id: string; name: string }>;
  onMove: (delta: number) => void;
  onChangeCategory: (catId: string | null) => void;
  onGrab: () => void;
  onDragEnd: () => void;
  onDropBefore: () => boolean;
}) {
  const { t } = useTranslation();
  if (!channel) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5 hover:border-lc-green/30"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        if (!onDropBefore()) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      data-testid={`layout-channel-${channel.id}`}
    >
      <Button
        variant="ghost"
        size="icon"
        draggable
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onGrab(); }}
        onDragEnd={onDragEnd}
        className="cursor-grab active:cursor-grabbing"
        aria-label={`Grab channel ${channel.name ?? channel.id}`}
        title={t('desktop.layout.dragChannel')}
      >
        <DragHandleIcon />
      </Button>
      <span className="text-lc-muted">#</span>
      <span className="flex-1 truncate text-sm text-lc-white">
        {channel.name ?? channel.id.slice(0, 12)}
      </span>
      <Select
        size="2xs"
        tone="dark"
        value={bucket ?? ''}
        onChange={(e) => onChangeCategory(e.target.value || null)}
        aria-label={t('desktop.layout.channelCategory').replace('{channel}', channel.name ?? channel.id.slice(0, 12))}
      >
        <option value="">(uncategorized)</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <MoveButtons onMove={onMove} first={first} last={last} />
    </div>
  );
}

/**
 * Up and down for a row in the layout editor: list-row ghost icon buttons
 * with chevrons (the ▲ ▼ glyphs they replace rendered in the OS font).
 */
export function MoveButtons({ onMove, first, last }: { onMove: (delta: number) => void; first: boolean; last: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={first} title={t('desktop.layout.moveUp')} aria-label={t('desktop.layout.moveUp')}>
        <ChevronRightIcon size={14} className="-rotate-90" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onMove(+1)} disabled={last} title={t('desktop.layout.moveDown')} aria-label={t('desktop.layout.moveDown')}>
        <ChevronRightIcon size={14} className="rotate-90" />
      </Button>
    </>
  );
}

export function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="4" cy="3" r="1"/><circle cx="10" cy="3" r="1"/>
      <circle cx="4" cy="7" r="1"/><circle cx="10" cy="7" r="1"/>
      <circle cx="4" cy="11" r="1"/><circle cx="10" cy="11" r="1"/>
    </svg>
  );
}
