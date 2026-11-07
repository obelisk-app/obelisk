import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Button from '@/components/ui/buttons/Button';
import { ChevronUpIcon, ChevronDownIcon, PlusIcon } from '@/assets/icons';
import { useRelayDeck } from '@/hooks/relay/rail/useRelayDeck';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import RelayDeckCard from './RelayDeckCard';

export default function RelayDeck({ relays, activeRelay, onSelect, onClose, onAdd }: {
  relays: readonly string[]; activeRelay: string | null; onSelect: (url: string) => void; onClose: () => void; onAdd?: () => void;
}) {
  const t = useTranslations();
  const vm = useRelayDeck(relays, activeRelay);
  return <Modal onClose={onClose} aria-label={t('mobile.nav.servers')} panelClassName="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-lc-border bg-lc-dark shadow-xl">
    <ModalHeader title={t('mobile.nav.servers')} onClose={onClose} />
    <div data-testid="relay-deck" data-no-swipe className="relative h-[464px] max-h-[65dvh] touch-none overflow-hidden overscroll-contain"
      onPointerDown={vm.onPointerDown} onPointerMove={vm.onPointerMove} onPointerUp={vm.onPointerUp} onPointerCancel={vm.onPointerUp}
      onClickCapture={vm.onClickCapture} onWheel={vm.onWheel} onKeyDown={vm.onKeyDown}>
      {relays.map((url, index) => <RelayDeckCard key={url} url={url} index={index} count={relays.length} position={vm.position}
        front={index === vm.front} settled={vm.settled} active={normalizeRelayUrl(url) === normalizeRelayUrl(activeRelay ?? '')}
        onFocus={() => vm.focus(index)} onSelect={() => onSelect(url)} />)}
    </div>
    <div className="flex items-center justify-center gap-4 pb-4">
      {onAdd && <Button variant="ghost" size="icon" aria-label={t('mobile.rail.addRelay')} onClick={onAdd}><PlusIcon /></Button>}
      {relays.length > 1 && <>
      <Button variant="ghost" size="icon" aria-label={t('common.previous')} onClick={() => vm.step(-1)}><ChevronUpIcon /></Button>
      <Button variant="ghost" size="icon" aria-label={t('common.next')} onClick={() => vm.step(1)}><ChevronDownIcon /></Button>
      </>}
    </div>
  </Modal>;
}
