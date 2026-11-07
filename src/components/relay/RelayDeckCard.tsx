import { TrashIcon } from '@/assets/icons';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';
import { useTranslations } from 'next-intl';
import { useRelayDeckCard } from '@/hooks/relay/rail/useRelayDeckCard';
import { relayDeckFrame } from '@/utils/relay/deck-frame';
import { colorFor } from '@/utils/relay-url/relay-tile-style';

export default function RelayDeckCard({ url, index, position, count, front, active, settled, onFocus, onSelect, onRemove, removeLabel, removeDisabled }: {
  url: string; index: number; position: number; count: number; front: boolean; active: boolean; settled: boolean;
  onFocus: () => void; onSelect: () => void;
  onRemove: () => void; removeLabel: string; removeDisabled: boolean;
}) {
  const t = useTranslations();
  const vm = useRelayDeckCard(url, active);
  const frame = relayDeckFrame(index, position, count);
  return (
    <div
      data-testid="relay-deck-card" data-front={front}
      style={{ ...frame.style, backgroundColor: colorFor(url) }}
      className="absolute left-[8%] top-1/2 -mt-[120px] h-[240px] w-[84%] select-none overflow-hidden rounded-2xl border border-lc-border text-left shadow-xl">
      {vm.banner && <RemoteImage src={vm.banner} alt="" onError={vm.onBannerError} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
      <Button variant="bare" className="absolute inset-0" onClick={front && settled ? onSelect : onFocus}
        tabIndex={front ? 0 : -1} aria-label={vm.name} aria-current={active ? 'true' : undefined} />
      <div style={frame.contentStyle} className="pointer-events-none relative flex h-full flex-col justify-between p-5 text-white">
        <span className="mr-14 truncate text-lg font-bold">{vm.name}</span>
        <div>
          {!vm.loaded && <Skeleton className="mb-2 h-4 w-32" />}
          {vm.description && <Text as="div" className="mb-3 line-clamp-2 text-sm text-white">{vm.description}</Text>}
          <Text as="div" className="truncate text-xs text-white">{url}</Text>
          <span className="mt-3 block w-full rounded-lg bg-lc-green px-3 py-3 text-center text-sm font-semibold text-lc-black">{t('shell.rail.switchTo')}</span>
        </div>
      </div>
      <span style={frame.peekStyle} className="pointer-events-none absolute left-5 right-5 truncate font-bold text-white">{vm.name}</span>
      {front && settled && <Button variant="danger" size="icon" className="absolute right-3 top-3 h-12 w-12"
        aria-label={removeLabel} title={removeLabel} disabled={removeDisabled} onClick={onRemove}><TrashIcon size={24} /></Button>}
      {vm.unread > 0 && <span aria-label={t('shell.rail.backgroundUnread', { count: String(vm.unread) })} className="pointer-events-none absolute left-5 top-12 rounded-full bg-lc-green px-2 text-lc-black">{vm.unread}</span>}
    </div>
  );
}
