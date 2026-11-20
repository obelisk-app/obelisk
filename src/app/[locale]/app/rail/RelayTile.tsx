'use client';

import Text from '@/components/ui/layout/Text';
import { RailTile } from './RailTile';
import { useTranslations } from 'next-intl';
import { useRelayTile } from '@/hooks/shell/rail/useRelayTile';
import { MENU_PANEL_CLASS, MenuItem } from '@/components/ui/overlays/menu';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One configured relay: its icon (or letter), unread markers and right-click menu. */
export function RelayTile({
  url,
  active,
  onClick,
  onRemove,
  hint,
}: {
  url: string;
  active: boolean;
  onClick: () => void;
  onRemove: () => void;
  hint?: string;
}) {
  const t = useTranslations();
  const {
    menu, openMenu, closeMenu, switchTo, remove, copied, copyShareLink,
    showHighlight, backgroundUnread, icon, onIconError, initials, accent,
  } = useRelayTile(url, active, { onClick, onRemove });
  return (
    <div className="relative">
      <RailTile
        active={active} title={url} onClick={onClick} onContextMenu={openMenu} hint={hint}
        accent={icon ? undefined : accent}
        icon={icon ? <RemoteImage src={icon} alt="" onError={onIconError} className="relative h-full w-full object-cover" />
          : <span className="relative text-base font-bold">{initials}</span>}
      />
      {backgroundUnread > 0 && (
        <span
          aria-label={t('shell.rail.backgroundUnread', { count: String(backgroundUnread) })}
          title={t('shell.rail.backgroundUnread', { count: String(backgroundUnread) })}
          data-testid="relay-background-unread"
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lc-green px-1 text-[9px] font-bold text-lc-black ring-2 ring-lc-black"
        >
          {backgroundUnread > 99 ? '99+' : backgroundUnread}
        </span>
      )}
      {showHighlight && (
        <span
          aria-label={t('shell.rail.unreadAria')}
          title={t('shell.rail.unreadTitle')}
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lc-green px-1 text-[9px] font-bold text-lc-black ring-2 ring-lc-black"
        >
          @
        </span>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div role="menu" aria-label={url} className={`absolute left-14 top-0 z-50 w-44 ${MENU_PANEL_CLASS}`}>
            <Text as="div" size="10" tone="muted" className="px-3 py-2 font-mono truncate">{url}</Text>
            <MenuItem label={t('shell.rail.switchTo')} onClick={switchTo} />
            <MenuItem
              label={copied ? t('common.copied') : t('shell.rail.copyShareLink')}
              onClick={() => { void copyShareLink(); }}
            />
            <MenuItem label={t('shell.rail.remove')} danger onClick={remove} />
          </div>
        </>
      )}
    </div>
  );
}
