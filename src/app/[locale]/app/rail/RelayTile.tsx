'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import HintDot from '@/components/hints/HintDot';
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
      {hint && <HintDot hintId={hint} />}
      <span
        className={
          'absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-lc-green transition-all ' +
          (active ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-50')
        }
      />
      <Button
        variant="bare"
        onClick={onClick}
        onContextMenu={openMenu}
        title={url}
        aria-label={url}
        {...(hint ? { 'data-tour': hint } : {})}
        style={{
          background: active && !icon ? accent : undefined,
          color: active ? '#0a0a0a' : '#fff',
        }}
        className={
          'group/tile relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl font-bold text-base ring-1 transition-all duration-150 hover:rounded-xl ' +
          (active
            ? 'ring-lc-green'
            : 'bg-lc-card text-lc-white ring-lc-border hover:rounded-xl')
        }
      >
        {!active && !icon && (
          <span
            aria-hidden="true"
            style={{ background: accent }}
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-30 transition-opacity duration-150 group-hover/tile:opacity-60 group-hover/tile:rounded-xl"
          />
        )}
        {icon ? (
          <RemoteImage
            src={icon}
            alt=""
            onError={onIconError}
            className="relative h-full w-full object-cover"
          />
        ) : (
          <span className="relative">{initials}</span>
        )}
      </Button>
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
