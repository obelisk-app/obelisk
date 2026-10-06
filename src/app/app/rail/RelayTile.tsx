'use client';

import HintDot from '@/components/hints/HintDot';
import { shortHost } from '@/utils/relay-url/url-host';
import { useTranslation } from '@/i18n/context';
import { colorFor, letterFor } from './relay-tile-style';
import { useRelayTile } from '@/hooks/app/rail/useRelayTile';
import { MENU_PANEL_CLASS, MenuItem } from '@/components/ui/menu';
import RemoteImage from '@/components/ui/RemoteImage';

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
  const { t } = useTranslation();
  const host = shortHost(url);
  const initials = letterFor(host);
  const accent = colorFor(host);
  const { menu, setMenu, copied, copyShareLink, showHighlight, backgroundUnread, icon, onIconError } = useRelayTile(url, active);
  return (
    <div className="relative">
      {hint && <HintDot hintId={hint} />}
      <span
        className={
          'absolute -left-3 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r bg-lc-green transition-all ' +
          (active ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-50')
        }
      />
      <button
        onClick={onClick}
        onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
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
      </button>
      {backgroundUnread > 0 && (
        <span
          aria-label={t('rail.backgroundUnread').replace('{count}', String(backgroundUnread))}
          title={t('rail.backgroundUnread').replace('{count}', String(backgroundUnread))}
          data-testid="relay-background-unread"
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lc-green px-1 text-[9px] font-bold text-lc-black ring-2 ring-lc-black"
        >
          {backgroundUnread > 99 ? '99+' : backgroundUnread}
        </span>
      )}
      {showHighlight && (
        <span
          aria-label={t('rail.unreadAria')}
          title={t('rail.unreadTitle')}
          className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-lc-green px-1 text-[9px] font-bold text-lc-black ring-2 ring-lc-black"
        >
          @
        </span>
      )}
      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
          <div role="menu" aria-label={url} className={`absolute left-14 top-0 z-50 w-44 ${MENU_PANEL_CLASS}`}>
            <div className="px-3 py-2 text-[10px] font-mono text-lc-muted truncate">{url}</div>
            <MenuItem label={t('rail.switchTo')} onClick={() => { setMenu(false); onClick(); }} />
            <MenuItem
              label={copied ? t('common.copied') : t('rail.copyShareLink')}
              onClick={() => { void copyShareLink(); }}
            />
            <MenuItem label={t('rail.remove')} danger onClick={() => { setMenu(false); onRemove(); }} />
          </div>
        </>
      )}
    </div>
  );
}
