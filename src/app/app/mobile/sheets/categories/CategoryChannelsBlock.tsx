'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import Select from '@/components/ui/Select';

/** The value the category picker uses for "no category". */
export const NO_CATEGORY = '__none__';

/** The picker's options: "Uncategorized" first, then the draft's categories in order. */
export function categoryOptions(
  categories: ReadonlyArray<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  return [
    { id: NO_CATEGORY, name: 'Uncategorized' },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];
}

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
  const { t } = useTranslation();
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
        {channelIds.map((id, i) => {
          const g = channelsById[id];
          if (!g) return null;
          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderTop: i === 0 ? 'none' : '1px solid var(--app-line)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{g.name ?? g.id.slice(0, 8)}
                </div>
              </div>
              <Select
                variant="bare"
                value={currentCatId}
                onChange={(e) => onAssign(id, e.target.value === NO_CATEGORY ? null : e.target.value)}
                style={{
                  background: 'var(--app-surface-2)',
                  color: 'var(--app-text)',
                  border: '1px solid var(--app-line)',
                  borderRadius: 8,
                  padding: '4px 6px',
                  fontSize: 11,
                  maxWidth: 110,
                }}
                aria-label={t('desktop.layout.channelCategory').replace('{channel}', g.name ?? g.id.slice(0, 8))}
              >
                {catOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </Select>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  type="button"
                  onClick={() => onMove(id, -1)}
                  disabled={i === 0}
                  style={{
                    width: 26,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid var(--app-line)',
                    background: 'var(--app-surface-2)',
                    color: 'var(--app-text-dim)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={`Move ${g.name ?? g.id.slice(0, 8)} up`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => onMove(id, 1)}
                  disabled={i === channelIds.length - 1}
                  style={{
                    width: 26,
                    height: 22,
                    borderRadius: 6,
                    border: '1px solid var(--app-line)',
                    background: 'var(--app-surface-2)',
                    color: 'var(--app-text-dim)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label={`Move ${g.name ?? g.id.slice(0, 8)} down`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
