import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import Button from '@/components/ui/buttons/Button';
import { ChevronUpIcon, ChevronDownIcon, PlusIcon } from '@/assets/icons';
import { useRelayDeckRemoval } from '@/hooks/relay/rail/useRelayDeckRemoval';
import { useCommunityDeck } from '@/hooks/relay/rail/useCommunityDeck';
import { Fragment } from 'react';
import ConcordDeckCard from '@/components/chat/concord/ConcordDeckCard';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import RelayDeckCard from './RelayDeckCard';

export default function RelayDeck({ relays, activeRelay, onSelect, onClose, onAdd }: {
  relays: readonly string[]; activeRelay: string | null; onSelect: (url: string) => void; onClose: () => void; onAdd?: () => void;
}) {
  const t = useTranslations();
  const vm = useCommunityDeck(relays, activeRelay, onSelect, onClose);
  const removal = useRelayDeckRemoval(relays, vm.relayIndex, onClose);
  return <Modal onClose={onClose} aria-label={t('mobile.nav.servers')} panelClassName="mx-4 max-h-[calc(100dvh-16px)] w-full max-w-md overflow-y-auto rounded-2xl border border-lc-border bg-lc-dark shadow-xl">
    <ModalHeader closeClassName="rounded-lg bg-lc-green/20 text-lc-green border border-lc-green/40" title={t('mobile.nav.servers')} onClose={onClose} />
    <div className="relative">
      <div data-testid="relay-deck" data-no-swipe className="relative h-[464px] max-h-[65dvh] min-h-[272px] touch-none overflow-hidden overscroll-contain"
        onPointerDown={vm.onPointerDown} onPointerMove={vm.onPointerMove} onPointerUp={vm.onPointerUp} onPointerCancel={vm.onPointerUp}
        onClickCapture={vm.onClickCapture} onWheel={vm.onWheel} onKeyDown={vm.onKeyDown}>
        {vm.entries.map((entry, index) => <Fragment key={entry.key}>
          {entry.kind === 'concord' ? <ConcordDeckCard community={entry.community} index={index} count={vm.entries.length} position={vm.position}
            front={index === vm.front} settled={vm.settled} active={entry.key === vm.active} onFocus={() => vm.focus(index)} onSelect={() => vm.selectConcord(entry.key)} />
            : <RelayDeckCard url={entry.url} index={index} count={vm.entries.length} position={vm.position}
              front={index === vm.front} settled={vm.settled} active={normalizeRelayUrl(entry.url) === normalizeRelayUrl(vm.active ?? '')}
              onFocus={() => vm.focus(index)} onSelect={() => vm.selectRelay(entry.url)}
              onRemove={removal.remove} removeLabel={removal.label} removeDisabled={removal.disabled} />}
        </Fragment>)}
      </div>
    </div>
    <div className="flex items-center justify-center gap-4 pb-4">
      {vm.entries.length > 1 && <Button variant="secondary" size="icon" className="h-12 w-12" aria-label={t('common.previous')} onClick={() => vm.step(-1)}><ChevronUpIcon size={28} /></Button>}
      {onAdd && <Button variant="primary" size="icon" className="h-[52px] w-[52px]" aria-label={t('mobile.rail.addRelay')} onClick={onAdd}><PlusIcon size={28} /></Button>}
      {vm.entries.length > 1 && <Button variant="secondary" size="icon" className="h-12 w-12" aria-label={t('common.next')} onClick={() => vm.step(1)}><ChevronDownIcon size={28} /></Button>}
    </div>
  </Modal>;
}
