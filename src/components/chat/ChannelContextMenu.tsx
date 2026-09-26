'use client';

/**
 * Channel right-click menu (desktop) / long-press sheet (mobile).
 *
 *   Mark as read
 *   Stop following / Follow channel
 *   Mute channel        ▸ 15 min · 1 h · 8 h · 24 h · Until I turn it back on
 *   Notification settings ▸ All messages · Only @mentions & replies · Nothing
 *   Copy link
 *
 * State lives in `src/store/channel-prefs.ts`; the bridge's
 * `deliverGroupPing` is what honours it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n/context';
import { useFormat } from '@/i18n/useFormat';
import {
  MUTED_FOREVER,
  isChannelMuted,
  notifyLevel,
  useChannelPref,
  useChannelPrefsStore,
  type ChannelNotifyLevel,
} from '@/store/channel-prefs';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';

export interface ChannelMenuTarget {
  readonly relay: string;
  readonly channelId: string;
  readonly name: string;
  /** Unread messages or unseen mention cards — "Mark as read" is greyed without. */
  readonly hasUnread: boolean;
}

const MUTE_OPTIONS: ReadonlyArray<{ key: string; ms: number }> = [
  { key: 'channelMenu.mute.15m', ms: 15 * 60_000 },
  { key: 'channelMenu.mute.1h', ms: 60 * 60_000 },
  { key: 'channelMenu.mute.8h', ms: 8 * 60 * 60_000 },
  { key: 'channelMenu.mute.24h', ms: 24 * 60 * 60_000 },
  { key: 'channelMenu.mute.forever', ms: MUTED_FOREVER },
];

const NOTIFY_OPTIONS: ReadonlyArray<{ level: ChannelNotifyLevel; key: string }> = [
  { level: 'all', key: 'channelMenu.notify.all' },
  { level: 'mentions', key: 'channelMenu.notify.mentions' },
  { level: 'nothing', key: 'channelMenu.notify.nothing' },
];

/** `https://…/app?relay=<host>&c=<id>` — the deep-link shape the app parses. */
export function channelLink(relay: string, channelId: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://obelisk.ar';
  const host = relay.replace(/^wss?:\/\//, '');
  return `${origin}/app?relay=${encodeURIComponent(host)}&c=${encodeURIComponent(channelId)}`;
}

function useChannelActions(target: ChannelMenuTarget) {
  const { relay, channelId } = target;
  const pref = useChannelPref(relay, channelId);
  const store = useChannelPrefsStore.getState;
  const [copied, setCopied] = useState(false);
  return {
    pref,
    muted: isChannelMuted(pref),
    level: notifyLevel(pref),
    following: !pref.unfollowed,
    copied,
    markRead: () => {
      useReadStateStore.getState().setGroupCursor(channelId, Date.now());
      useNotificationsStore.getState().markChannelMentionsSeen(relay, channelId);
    },
    toggleFollow: () => store().setFollowing(relay, channelId, !!pref.unfollowed),
    mute: (ms: number) => store().setMutedUntil(relay, channelId, ms === MUTED_FOREVER ? MUTED_FOREVER : Date.now() + ms),
    unmute: () => store().setMutedUntil(relay, channelId, null),
    setLevel: (level: ChannelNotifyLevel) => store().setNotify(relay, channelId, level),
    copyLink: async () => {
      try {
        await navigator.clipboard.writeText(channelLink(relay, channelId));
        setCopied(true);
      } catch { /* clipboard blocked — nothing to do */ }
    },
  };
}

function useMutedLabel(until: number | undefined): string | null {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  if (until === undefined) return null;
  if (until === MUTED_FOREVER) return t('channelMenu.mutedForever');
  return t('channelMenu.mutedUntil').replace('{time}', formatDateTime(until, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }));
}

// -- desktop ---------------------------------------------------------------

export function ChannelContextMenu({
  target,
  x,
  y,
  onClose,
}: {
  target: ChannelMenuTarget;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const a = useChannelActions(target);
  const mutedLabel = useMutedLabel(a.muted ? a.pref.mutedUntil : undefined);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [sub, setSub] = useState<'mute' | 'notify' | null>(null);
  const [flipSub, setFlipSub] = useState(false);

  // Keep the menu on screen; open submenus to the left near the right edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    setPos({ left, top });
    setFlipSub(left + r.width + 240 > window.innerWidth);
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const act = (fn: () => void) => () => { fn(); onClose(); };
  const itemCls = 'flex w-full items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-sm text-lc-white hover:bg-lc-green/15 disabled:cursor-default disabled:text-lc-muted/60 disabled:hover:bg-transparent';
  const sep = <div className="my-1 h-px bg-lc-border" />;
  const chevron = <span aria-hidden="true" className="text-lc-muted">›</span>;
  const subCls = `absolute top-0 min-w-[230px] rounded-lg border border-lc-border bg-lc-dark p-1.5 shadow-2xl ${flipSub ? 'right-full mr-1' : 'left-full ml-1'}`;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={target.name}
      data-testid="channel-context-menu"
      className="fixed z-[200] min-w-[240px] rounded-lg border border-lc-border bg-lc-dark p-1.5 shadow-2xl"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" role="menuitem" className={itemCls} disabled={!target.hasUnread} onClick={act(a.markRead)} data-testid="channel-menu-mark-read">
        {t('channelMenu.markRead')}
      </button>
      {sep}
      <button type="button" role="menuitem" className={itemCls} onClick={act(a.toggleFollow)} data-testid="channel-menu-follow">
        {a.following ? t('channelMenu.unfollow') : t('channelMenu.follow')}
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={act(() => void a.copyLink())}
        data-testid="channel-menu-copy-link"
      >
        {t('channelMenu.copyLink')}
      </button>
      {sep}
      <div className="relative" onMouseEnter={() => setSub('mute')} onMouseLeave={() => setSub(null)}>
        {a.muted ? (
          <button type="button" role="menuitem" className={itemCls} onClick={act(a.unmute)} data-testid="channel-menu-unmute">
            <span className="flex flex-col">
              <span>{t('channelMenu.unmute')}</span>
              {mutedLabel && <span className="text-[11px] text-lc-muted">{mutedLabel}</span>}
            </span>
          </button>
        ) : (
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sub === 'mute'}
            className={itemCls}
            onClick={() => setSub(sub === 'mute' ? null : 'mute')}
            data-testid="channel-menu-mute"
          >
            {t('channelMenu.mute')} {chevron}
          </button>
        )}
        {!a.muted && sub === 'mute' && (
          <div role="menu" className={subCls} data-testid="channel-menu-mute-sub">
            {MUTE_OPTIONS.map((o) => (
              <button key={o.key} type="button" role="menuitem" className={itemCls} onClick={act(() => a.mute(o.ms))} data-testid={`channel-menu-mute-${o.ms}`}>
                {t(o.key)}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="relative" onMouseEnter={() => setSub('notify')} onMouseLeave={() => setSub(null)}>
        <button
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={sub === 'notify'}
          className={itemCls}
          onClick={() => setSub(sub === 'notify' ? null : 'notify')}
          data-testid="channel-menu-notify"
        >
          <span className="flex flex-col">
            <span>{t('channelMenu.notify')}</span>
            <span className="text-[11px] text-lc-muted">{t(`channelMenu.notify.${a.level}`)}</span>
          </span>
          {chevron}
        </button>
        {sub === 'notify' && (
          <div role="menu" className={subCls} data-testid="channel-menu-notify-sub">
            {NOTIFY_OPTIONS.map((o) => (
              <button
                key={o.level}
                type="button"
                role="menuitemradio"
                aria-checked={a.level === o.level}
                className={itemCls}
                onClick={act(() => a.setLevel(o.level))}
                data-testid={`channel-menu-notify-${o.level}`}
              >
                {t(o.key)}
                <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full border-2 ${a.level === o.level ? 'border-lc-green bg-lc-green' : 'border-lc-muted'}`} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// -- mobile ----------------------------------------------------------------

export function ChannelActionSheet({ target, onClose }: { target: ChannelMenuTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const a = useChannelActions(target);
  const mutedLabel = useMutedLabel(a.muted ? a.pref.mutedUntil : undefined);
  const [view, setView] = useState<'main' | 'mute' | 'notify'>('main');
  const act = (fn: () => void) => () => { fn(); onClose(); };

  const row = (label: string, onClick: () => void, opts: { hint?: string | null; testId: string; disabled?: boolean; chevron?: boolean; checked?: boolean } ) => (
    <button
      key={opts.testId}
      type="button"
      className="settings-row action"
      style={{ width: '100%', opacity: opts.disabled ? 0.45 : 1 }}
      disabled={opts.disabled}
      onClick={onClick}
      data-testid={opts.testId}
      role={opts.checked === undefined ? undefined : 'menuitemradio'}
      aria-checked={opts.checked}
    >
      <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
        <span style={{ display: 'block' }}>{label}</span>
        {opts.hint && <span className="settings-row-meta muted" style={{ display: 'block', marginTop: 3 }}>{opts.hint}</span>}
      </span>
      {opts.chevron && <span className="settings-row-meta muted" aria-hidden="true">›</span>}
      {opts.checked !== undefined && <span className={`toggle ${opts.checked ? 'on' : ''}`} aria-hidden="true" />}
    </button>
  );

  return (
    <div className="sheet-host" data-screen="channel-menu" data-testid="channel-action-sheet">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet native-scroll-y" style={{ maxHeight: '88%' }}>
        <div className="sheet-handle" />
        <div style={{ padding: '4px 4px 12px', fontSize: 16, fontWeight: 700, color: 'var(--app-text)' }}>
          {view === 'main' ? `# ${target.name}` : (
            <button type="button" onClick={() => setView('main')} style={{ background: 'none', border: 0, color: 'var(--app-text)', font: 'inherit', padding: 0 }}>
              ‹ {view === 'mute' ? t('channelMenu.mute') : t('channelMenu.notify')}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {view === 'main' && <>
            {row(t('channelMenu.markRead'), act(a.markRead), { testId: 'channel-menu-mark-read', disabled: !target.hasUnread })}
            {row(a.following ? t('channelMenu.unfollow') : t('channelMenu.follow'), act(a.toggleFollow), {
              testId: 'channel-menu-follow',
              hint: a.following ? t('channelMenu.unfollowHint') : null,
            })}
            {a.muted
              ? row(t('channelMenu.unmute'), act(a.unmute), { testId: 'channel-menu-unmute', hint: mutedLabel })
              : row(t('channelMenu.mute'), () => setView('mute'), { testId: 'channel-menu-mute', chevron: true })}
            {row(t('channelMenu.notify'), () => setView('notify'), { testId: 'channel-menu-notify', chevron: true, hint: t(`channelMenu.notify.${a.level}`) })}
            {row(t('channelMenu.copyLink'), act(() => void a.copyLink()), { testId: 'channel-menu-copy-link' })}
          </>}
          {view === 'mute' && MUTE_OPTIONS.map((o) => row(t(o.key), act(() => a.mute(o.ms)), { testId: `channel-menu-mute-${o.ms}` }))}
          {view === 'notify' && NOTIFY_OPTIONS.map((o) => row(t(o.key), act(() => a.setLevel(o.level)), {
            testId: `channel-menu-notify-${o.level}`,
            checked: a.level === o.level,
          }))}
        </div>
      </div>
    </div>
  );
}
