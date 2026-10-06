'use client';

import type { LibraryTab } from '@/utils/media-library/types';

const tabClass = 'w-full rounded-lg px-3 py-2 text-left text-sm transition';

export default function LibraryTabs({ tab, setTab, server, mobile = false }: {
  tab: LibraryTab;
  setTab: (tab: LibraryTab) => void;
  server: boolean;
  mobile?: boolean;
}) {
  return <>{([
    ['discover', 'Marketplace'],
    ['mine', 'My packs'],
    ...(server ? [["server", "Server packs"]] : [['favorites', 'Favorites']]),
  ] as Array<[LibraryTab, string]>).map(([value, label]) => (
    <button key={value} type="button" onClick={() => setTab(value)} className={`${mobile ? 'rounded-lg px-3 py-2 text-sm' : tabClass} ${tab === value ? 'bg-lc-green/15 text-lc-green' : 'text-lc-muted hover:bg-white/5 hover:text-lc-white'}`}>
      {label}
    </button>
  ))}</>;
}
