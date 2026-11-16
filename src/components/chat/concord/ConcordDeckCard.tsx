'use client';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useTranslations } from 'next-intl';
import { useConcordBranding } from '@/hooks/chat/concord/useConcordBranding';
import { relayDeckFrame } from '@/utils/relay/deck-frame';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';

export default function ConcordDeckCard({ community, index, position, count, front, active, settled, onFocus, onSelect }: {
  community: ConcordCommunity; index: number; position: number; count: number; front: boolean; active: boolean; settled: boolean;
  onFocus: () => void; onSelect: () => void;
}) {
  const t = useTranslations();
  const { branding } = useConcordBranding(community);
  const frame = relayDeckFrame(index, position, count);
  return <div data-testid="concord-deck-card" data-front={front} style={frame.style}
    className="absolute left-[8%] top-1/2 -mt-[120px] h-[240px] w-[84%] select-none overflow-hidden rounded-2xl border border-lc-border bg-lc-olive text-left shadow-xl">
    {branding.banner && <RemoteImage src={branding.banner} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
    <Button variant="bare" className="absolute inset-0" onClick={front && settled ? onSelect : onFocus} tabIndex={front ? 0 : -1} aria-label={branding.name} aria-current={active ? 'true' : undefined} />
    <div style={frame.contentStyle} className="pointer-events-none relative flex h-full flex-col justify-between p-5 text-white">
      <span className="flex items-center gap-3 truncate text-lg font-bold">{branding.icon && <RemoteImage src={branding.icon} alt="" className="h-10 w-10 rounded-xl object-cover" />}{branding.name}</span>
      <div>
        {branding.description && <p className="mb-3 line-clamp-2 text-sm">{branding.description}</p>}
        <span className="mt-3 block w-full rounded-lg bg-lc-green px-3 py-3 text-center text-sm font-semibold text-lc-black">{t('shell.rail.switchTo')}</span>
      </div>
    </div>
    <span style={frame.peekStyle} className="pointer-events-none absolute left-5 right-5 truncate font-bold text-white">{branding.name}</span>
  </div>;
}
