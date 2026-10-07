'use client';

import { useTranslations } from 'next-intl';
import { useMobileServerRail } from '@/hooks/shell/mobile/rail/useMobileServerRail';
import type { RelayLongPressInfo } from '@/hooks/shell/mobile/rail/useMobileRelayTile';
import { RelayTile } from './RelayTile';

/** The phone's vertical relay rail: one tile per configured relay, then "add relay". */
export function MobileServerRail({
  relays,
  activeRelay,
  onSelectRelay,
  onAddRelay,
  onLongPress,
}: {
  relays: ReadonlyArray<string>;
  activeRelay: string | null;
  onSelectRelay: (url: string) => void;
  onAddRelay: () => void;
  onLongPress?: (info: RelayLongPressInfo) => void;
}) {
  const t = useTranslations();
  const vm = useMobileServerRail(activeRelay);
  return (
    <aside className="spaces-rail" data-testid="mobile-server-rail" aria-label={t('mobile.nav.servers')}>
      <div className="spaces-rail-scroll native-scroll-y" data-no-swipe>
        {relays.map((url) => (
          <RelayTile
            key={url}
            url={url}
            active={vm.isActive(url)}
            onClick={() => onSelectRelay(url)}
            onLongPress={onLongPress}
          />
        ))}
        <button className="space space-add" onClick={onAddRelay} aria-label={t('mobile.rail.addRelay')}>
          <div className="space-icon s-add">+</div>
          <span className="space-name">&nbsp;</span>
        </button>
      </div>
    </aside>
  );
}
