'use client';

import { useMemo, useRef, useState } from 'react';
import { useSearchStore, ActiveFilters, HasFilter } from '@/store/search';
import { useChatStore } from '@/store/chat';
import { useT } from '@/store/locale';
import { formatPubkey } from '@nostr-wot/data';
import { useClickOutside } from '@/hooks/useClickOutside';

interface Props {
  profileCache: Map<string, { name?: string; picture?: string }>;
  onChange: () => void;
}

function PanelShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose, { escape: true });

  return (
    <div ref={ref} className="absolute top-full right-0 mt-2 w-[320px] max-w-[calc(100vw-1rem)] bg-lc-dark border border-lc-border rounded-xl shadow-lg z-50 overflow-hidden" data-testid="search-filter-picker">
      <div className="px-3 py-2 border-b border-lc-border text-xs font-medium text-lc-muted">{title}</div>
      <div className="max-h-[360px] overflow-y-auto">{children}</div>
    </div>
  );
}

function MemberPickerPanel({
  filterKey,
  profileCache,
  onPicked,
  onClose,
}: {
  filterKey: 'from' | 'mentions';
  profileCache: Map<string, { name?: string; picture?: string }>;
  onPicked: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const memberList = useChatStore((s) => s.memberList);
  const { setFilter } = useSearchStore();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = memberList.slice(0, 200);
    if (!needle) return base.slice(0, 50);
    return base.filter((m) => m.displayName?.toLowerCase().includes(needle) || m.pubkey.startsWith(needle)).slice(0, 50);
  }, [memberList, q]);

  const title = filterKey === 'from' ? t('search.picker.from.title') : t('search.picker.mentions.title');

  return (
    <PanelShell title={title} onClose={onClose}>
      <div className="p-2 border-b border-lc-border">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.picker.searchMembers')}
          className="w-full bg-lc-black border border-lc-border rounded px-2 py-1 text-sm text-lc-white placeholder:text-lc-muted focus:outline-none focus:border-lc-green/40"
          autoFocus
          data-testid="search-member-picker-input"
        />
      </div>
      <div className="py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-lc-muted">—</div>
        )}
        {filtered.map((m) => {
          const profile = profileCache.get(m.pubkey);
          const name = m.displayName || profile?.name || formatPubkey(m.pubkey);
          return (
            <button
              key={m.pubkey}
              onClick={() => {
                setFilter(filterKey, { pubkey: m.pubkey, name });
                onPicked();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-lc-border/40 text-left"
              data-testid="search-member-picker-item"
            >
              {profile?.picture || m.picture ? (
                <img src={profile?.picture || m.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-[10px] font-semibold">
                  {name[0]?.toUpperCase() || '?'}
                </div>
              )}
              <span className="text-sm text-lc-white truncate">{name}</span>
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}

function ChannelPickerPanel({ onPicked, onClose }: { onPicked: () => void; onClose: () => void }) {
  const t = useT();
  const categories = useChatStore((s) => s.categories);
  const pinnedChannels = useChatStore((s) => s.pinnedChannels);
  const { setFilter } = useSearchStore();
  const [q, setQ] = useState('');

  const channels = useMemo(() => {
    const flat = [
      ...pinnedChannels,
      ...categories.flatMap((c) => c.channels),
    ];
    const seen = new Set<string>();
    const unique = flat.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    const needle = q.trim().toLowerCase();
    if (!needle) return unique;
    return unique.filter((c) => c.name.toLowerCase().includes(needle));
  }, [categories, pinnedChannels, q]);

  return (
    <PanelShell title={t('search.picker.in.title')} onClose={onClose}>
      <div className="p-2 border-b border-lc-border">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search.picker.searchChannels')}
          className="w-full bg-lc-black border border-lc-border rounded px-2 py-1 text-sm text-lc-white placeholder:text-lc-muted focus:outline-none focus:border-lc-green/40"
          autoFocus
          data-testid="search-channel-picker-input"
        />
      </div>
      <div className="py-1">
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => {
              setFilter('in', { id: c.id, name: c.name });
              onPicked();
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-lc-border/40 text-left"
            data-testid="search-channel-picker-item"
          >
            <span className="text-lc-muted">#</span>
            <span className="text-sm text-lc-white truncate">{c.name}</span>
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

function HasPanel({ onPicked, onClose }: { onPicked: () => void; onClose: () => void }) {
  const t = useT();
  const { setFilter } = useSearchStore();
  const options: { value: HasFilter; label: string }[] = [
    { value: 'link', label: t('search.has.link') },
    { value: 'image', label: t('search.has.image') },
    { value: 'video', label: t('search.has.video') },
    { value: 'file', label: t('search.has.file') },
  ];
  return (
    <PanelShell title={t('search.picker.has.title')} onClose={onClose}>
      <div className="py-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => { setFilter('has', o.value); onPicked(); }}
            className="w-full text-left px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40"
            data-testid={`search-has-option-${o.value}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </PanelShell>
  );
}

function MorePanel({ onPicked, onClose }: { onPicked: () => void; onClose: () => void }) {
  const t = useT();
  const { activeFilters, setFilter, removeFilter } = useSearchStore();
  const [before, setBefore] = useState(activeFilters.before ?? '');
  const [after, setAfter] = useState(activeFilters.after ?? '');

  const apply = () => {
    if (before) setFilter('before', before); else removeFilter('before');
    if (after) setFilter('after', after); else removeFilter('after');
    onPicked();
  };

  return (
    <PanelShell title={t('search.picker.more.title')} onClose={onClose}>
      <div className="p-3 space-y-2">
        <label className="block text-xs text-lc-muted">
          {t('search.picker.after')}
          <input
            type="date"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            className="mt-1 w-full bg-lc-black border border-lc-border rounded px-2 py-1 text-sm text-lc-white"
          />
        </label>
        <label className="block text-xs text-lc-muted">
          {t('search.picker.before')}
          <input
            type="date"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="mt-1 w-full bg-lc-black border border-lc-border rounded px-2 py-1 text-sm text-lc-white"
          />
        </label>
        <button
          onClick={apply}
          className="lc-pill-primary w-full text-sm"
          data-testid="search-more-apply"
        >
          OK
        </button>
      </div>
    </PanelShell>
  );
}

export default function FilterPicker({ profileCache, onChange }: Props) {
  const { pickerMode, closePicker } = useSearchStore();
  if (!pickerMode) return null;

  const onPicked = () => {
    closePicker();
    onChange();
  };

  if (pickerMode === 'from' || pickerMode === 'mentions') {
    return <MemberPickerPanel filterKey={pickerMode} profileCache={profileCache} onPicked={onPicked} onClose={closePicker} />;
  }
  if (pickerMode === 'in') {
    return <ChannelPickerPanel onPicked={onPicked} onClose={closePicker} />;
  }
  if (pickerMode === 'has') {
    return <HasPanel onPicked={onPicked} onClose={closePicker} />;
  }
  if (pickerMode === 'more') {
    return <MorePanel onPicked={onPicked} onClose={closePicker} />;
  }
  return null;
}
