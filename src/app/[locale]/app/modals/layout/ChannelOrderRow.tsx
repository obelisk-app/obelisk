'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { categoryLabel } from '@/utils/relay/category-label';
import Select from '@/components/ui/forms/Select';
import Button from '@/components/ui/buttons/Button';
import { useChannelOrderRow } from '@/hooks/shell/modals/layout/useChannelOrderRow';
import { DragHandleIcon } from './DragHandleIcon';
import { MoveButtons } from './MoveButtons';

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
  const t = useTranslations();
  const row = useChannelOrderRow({ onGrab, onDropBefore, onChangeCategory });
  if (!channel) return null;
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5 hover:border-lc-green/30"
      onDragOver={row.onDragOver}
      onDrop={row.onDrop}
      data-testid={`layout-channel-${channel.id}`}
    >
      <Button
        variant="ghost"
        size="icon"
        draggable
        onDragStart={row.onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab active:cursor-grabbing"
        aria-label={t('shell.desktop.layout.grabChannel', { name: channel.name ?? channel.id })}
        title={t('shell.desktop.layout.dragChannel')}
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
        onChange={row.onCategoryChange}
        aria-label={t('shell.desktop.layout.channelCategory', { channel: channel.name ?? channel.id.slice(0, 12) })}
      >
        <option value="">{t('shell.desktop.layout.uncategorizedOption')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {categoryLabel(c.name, t)}
          </option>
        ))}
      </Select>
      <MoveButtons onMove={onMove} first={first} last={last} />
    </div>
  );
}
