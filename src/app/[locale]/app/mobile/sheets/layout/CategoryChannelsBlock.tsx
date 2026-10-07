'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { categoryChannelRows } from '@/utils/shell/mobile/category-options';
import { CategoryChannelRow } from './CategoryChannelRow';

/** One category's channels, each with a category picker and up/down buttons. */
export function CategoryChannelsBlock({
  catName,
  channelIds,
  channelsById,
  catOptions,
  currentCatId,
  onAssign,
  onMove,
}: {
  catName: string;
  channelIds: ReadonlyArray<string>;
  channelsById: Record<string, JsGroup>;
  catOptions: ReadonlyArray<{ id: string; name: string }>;
  currentCatId: string;
  onAssign: (channelId: string, categoryId: string | null) => void;
  onMove: (channelId: string, delta: number) => void;
}) {
  if (channelIds.length === 0) return null;
  return (
    <div
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-line)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--app-text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          borderBottom: '1px solid var(--app-line)',
        }}
      >
        {catName} · {channelIds.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {categoryChannelRows(channelIds, channelsById).map((row) => (
          <CategoryChannelRow
            key={row.id}
            channel={row.channel}
            first={row.first}
            last={row.last}
            catOptions={catOptions}
            currentCatId={currentCatId}
            onAssign={onAssign}
            onMove={onMove}
          />
        ))}
      </div>
    </div>
  );
}
