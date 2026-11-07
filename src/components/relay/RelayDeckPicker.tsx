import { useRelayDeckPicker } from '@/hooks/relay/rail/useRelayDeckPicker';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { ServerIcon } from '@/assets/icons';
import RelayDeck from './RelayDeck';

export default function RelayDeckPicker({ relays, activeRelay, onSelect }: {
  relays: readonly string[]; activeRelay: string | null; onSelect: (url: string) => void;
}) {
  const t = useTranslations();
  const vm = useRelayDeckPicker(onSelect);
  return <>
    <Button variant="ghost" size="icon" className="mx-auto h-12 w-12 shrink-0" aria-label={t('mobile.nav.servers')} onClick={vm.show} data-testid="relay-deck-picker"><ServerIcon size={22} /></Button>
    {vm.open && <RelayDeck relays={relays} activeRelay={activeRelay} onClose={vm.close} onSelect={vm.select} />}
  </>;
}
