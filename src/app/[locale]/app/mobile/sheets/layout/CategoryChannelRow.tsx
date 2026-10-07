'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import Select from '@/components/ui/forms/Select';
import { categoryIdFromOption } from '@/utils/shell/mobile/category-options';
import { ChevronDownIcon, ChevronUpIcon } from '@/assets/icons';

const moveButtonStyle: React.CSSProperties = {
  width: 26,
  height: 22,
  borderRadius: 6,
  border: '1px solid var(--app-line)',
  background: 'var(--app-surface-2)',
  color: 'var(--app-text-dim)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** One channel in a category block: its name, a category picker, and up/down buttons. */
export function CategoryChannelRow({
  channel,
  first,
  last,
  catOptions,
  currentCatId,
  onAssign,
  onMove,
}: {
  channel: JsGroup;
  first: boolean;
  last: boolean;
  catOptions: ReadonlyArray<{ id: string; name: string }>;
  currentCatId: string;
  onAssign: (channelId: string, categoryId: string | null) => void;
  onMove: (channelId: string, delta: number) => void;
}) {
  const t = useTranslations();
  const name = channel.name ?? channel.id.slice(0, 8);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderTop: first ? 'none' : '1px solid var(--app-line)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--app-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          #{name}
        </div>
      </div>
      <Select
        variant="bare"
        value={currentCatId}
        onChange={(e) => onAssign(channel.id, categoryIdFromOption(e.target.value))}
        style={{
          background: 'var(--app-surface-2)',
          color: 'var(--app-text)',
          border: '1px solid var(--app-line)',
          borderRadius: 8,
          padding: '4px 6px',
          fontSize: 11,
          maxWidth: 110,
        }}
        aria-label={t('shell.desktop.layout.channelCategory', { channel: name })}
      >
        {catOptions.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.name}</option>
        ))}
      </Select>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          type="button"
          onClick={() => onMove(channel.id, -1)}
          disabled={first}
          style={moveButtonStyle}
          aria-label={t('mobile.layout.moveChannelUp', { name })}
        >
          <ChevronUpIcon size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => onMove(channel.id, 1)}
          disabled={last}
          style={moveButtonStyle}
          aria-label={t('mobile.layout.moveChannelDown', { name })}
        >
          <ChevronDownIcon size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
