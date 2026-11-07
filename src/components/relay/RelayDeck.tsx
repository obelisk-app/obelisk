import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Button from '@/components/ui/buttons/Button';
import { ChevronUpIcon, ChevronDownIcon } from '@/assets/icons';
import { useRelayDeck } from '@/hooks/relay/rail/useRelayDeck';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import RelayDeckCard from './RelayDeckCard';

export default function RelayDeck({ relays, activeRelay, onSelect, onClose }: {
  relays: readonly string[]; activeRelay: string | null; onSelect: (url: string) => void; onClose: () => void;
}) {
  const t = useTranslations();
  const vm = useRelayDeck(relays, activeRelay);
  return <Modal onClose={onClose} aria-label={t('mobile.nav.servers')} panelClassName="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-xl">
    <ModalHeader title={t('mobile.nav.servers')} onClose={onClose} />
    <div data-testid="relay-deck" data-no-swipe className="relative h-[464px] max-h-[65dvh] touch-none overflow-hidden overscroll-contain"
      onPointerDown={vm.onPointerDown} onPointerMove={vm.onPointerMove} onPointerUp={vm.onPointerUp} onPointerCancel={vm.onPointerUp}
      onClickCapture={vm.onClickCapture} onWheel={vm.onWheel} onKeyDown={vm.onKeyDown}>
      {relays.map((url, index) => <RelayDeckCard key={url} url={url} index={index} count={relays.length} position={vm.position}
        front={index === vm.front} active={normalizeRelayUrl(url) === normalizeRelayUrl(activeRelay ?? '')}
        onFocus={() => vm.focus(index)} onSelect={() => onSelect(url)} />)}
    </div>
    {relays.length > 1 && <div className="flex justify-center gap-4 pb-4">
      <Button variant="ghost" size="icon" aria-label={t('common.previous')} onClick={() => vm.step(-1)}><ChevronUpIcon /></Button>
      <Button variant="ghost" size="icon" aria-label={t('common.next')} onClick={() => vm.step(1)}><ChevronDownIcon /></Button>
    </div>}
  </Modal>;
}
