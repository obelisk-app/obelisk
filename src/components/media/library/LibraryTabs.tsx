'use client';

import { useTranslations } from 'next-intl';
import type { MessageKey } from '@/i18n/keys';
import type { LibraryTab } from '@/utils/media-library/types';

const tabClass = 'w-full rounded-lg px-3 py-2 text-left text-sm transition';

export default function LibraryTabs({ tab, setTab, server, mobile = false }: {
  tab: LibraryTab;
  setTab: (tab: LibraryTab) => void;
  server: boolean;
  mobile?: boolean;
}) {
  const t = useTranslations();
  return <>{([
    ['discover', 'media.tabs.discover'],
    ['mine', 'media.tabs.mine'],
    server ? ['server', 'media.serverPacks'] : ['favorites', 'media.tabs.favorites'],
  ] as Array<[LibraryTab, MessageKey]>).map(([value, label]) => (
    <button key={value} type="button" onClick={() => setTab(value)} className={`${mobile ? 'rounded-lg px-3 py-2 text-sm' : tabClass} ${tab === value ? 'bg-lc-green/15 text-lc-green' : 'text-lc-muted hover:bg-white/5 hover:text-lc-white'}`}>
      {t(label)}
    </button>
  ))}</>;
}
