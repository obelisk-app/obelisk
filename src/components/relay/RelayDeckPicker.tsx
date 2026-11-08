import type { ReactNode } from 'react';
import { useRelayDeckPicker } from '@/hooks/relay/rail/useRelayDeckPicker';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import { ChevronDownIcon } from '@/assets/icons';
import RelayDeck from './RelayDeck';

/** The active relay is the phone's picker trigger; no separate relay rail. */
export default function RelayDeckPicker({ relays, activeRelay, onSelect, onAdd, children }: {
  relays: readonly string[]; activeRelay: string | null; onSelect: (url: string) => void;
  onAdd?: () => void; children?: ReactNode;
}) {
  const t = useTranslations();
  const vm = useRelayDeckPicker(onSelect, onAdd);
  return <>
    <Button variant="bare" className="relay-deck-trigger flex w-full min-w-0 items-center gap-3 text-left text-lc-white"
      aria-label={t('mobile.nav.servers')} aria-haspopup="dialog" aria-expanded={vm.open}
      onClick={vm.show} data-testid="relay-deck-picker">
      <span className="min-w-0 flex-1 truncate">{children || activeRelay}</span><span className="relay-deck-chevron" aria-hidden="true"><ChevronDownIcon size={24} /></span>
    </Button>
    {vm.open && <RelayDeck relays={relays} activeRelay={activeRelay} onClose={vm.close} onSelect={vm.select} onAdd={onAdd ? vm.add : undefined} />}
  </>;
}
