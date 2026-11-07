import { useMobileRelayStatus } from '@/hooks/relay/status/useMobileRelayStatus';
import RelayStatusPill from './RelayStatusPill';
import Text from '@/components/ui/layout/Text';
import { MenuDivider } from '@/components/ui/overlays/menu';

/** One mobile status square opens both signing and relay diagnostics. */
export default function MobileRelayStatus({ relays, activeRelay, onOpenSettings }: {
  relays: readonly string[]; activeRelay: string | null; onOpenSettings: () => void;
}) {
  const vm = useMobileRelayStatus();
  return <RelayStatusPill relays={relays} activeRelay={activeRelay} onOpenSettings={onOpenSettings}
    compact indicate="active" mobileSigning={vm}>
    <div className="px-2.5 py-2" data-testid="mobile-signing-details">
      <Text as="p" size="xs" weight="semibold">{vm.label}</Text>
      <Text as="p" size="xs" tone="accent">{vm.statusText}</Text>
      <Text as="p" size="xs">{vm.title}</Text>
      {vm.detail && <Text as="p" size="xs" tone="muted">{vm.detail}</Text>}
    </div>
    <MenuDivider />
  </RelayStatusPill>;
}
