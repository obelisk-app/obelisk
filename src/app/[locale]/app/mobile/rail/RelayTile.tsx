'use client';

import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useMobileRelayTile, type RelayLongPressInfo } from '@/hooks/shell/mobile/rail/useMobileRelayTile';
import { avatarStyle } from '../common/avatar';

/**
 * Relay tile in the spaces strip: the domain favicon, falling back to a
 * letter on a gradient, the relay's name, and a badge for unread mentions on
 * a relay you are not on. A long press (or right-click) opens the relay menu.
 * State and handlers come from `useMobileRelayTile`.
 */
export function RelayTile({
  url,
  active,
  onClick,
  onLongPress,
}: {
  url: string;
  active: boolean;
  onClick: () => void;
  onLongPress?: (info: RelayLongPressInfo) => void;
}) {
  const t = useTranslations();
  const vm = useMobileRelayTile(url, active, onClick, onLongPress);
  return (
    <button
      className={`space ${active ? 'active' : ''}`}
      onClick={vm.onClick}
      onTouchStart={vm.startPress}
      onTouchEnd={vm.cancelPress}
      onTouchMove={vm.cancelPress}
      onTouchCancel={vm.cancelPress}
      onContextMenu={vm.onContextMenu}
    >
      <div className="space-icon" style={vm.iconUrl ? undefined : avatarStyle(url)}>
        {vm.iconUrl ? (
          <RemoteImage src={vm.iconUrl} alt="" onError={vm.onIconError} />
        ) : (
          vm.letter
        )}
      </div>
      {vm.backgroundUnread > 0 && (
        <span
          className="space-badge"
          aria-label={t('shell.rail.backgroundUnread', { count: String(vm.backgroundUnread) })}
          data-testid="relay-background-unread"
        >
          {vm.badgeText}
        </span>
      )}
      <span className="space-name">{vm.label}</span>
    </button>
  );
}
