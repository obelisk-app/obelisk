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
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n/context';
import { MUTED_FOREVER } from '@/store/channel-prefs';
import { useChannelActions } from '@/hooks/chat/useChannelActions';
import { useMutedLabel } from '@/hooks/chat/useMutedLabel';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/menu';
import { AtIcon, BellIcon, BellOffIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, LinkIcon, StarIcon } from '@/components/ui/icons';
import { MUTE_OPTIONS, NOTIFY_OPTIONS, type ChannelMenuTarget } from './channel-menu/channel-menu-options';
import { useMenuDismiss, useMenuPlacement } from './channel-menu/useMenuPlacement';
import { SubMenu } from './channel-menu/SubMenu';

export type { ChannelMenuTarget } from './channel-menu/channel-menu-options';
export { ChannelActionSheet } from './channel-menu/ChannelActionSheet';

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
  const [sub, setSub] = useState<'mute' | 'notify' | null>(null);
  const { pos, flipSub } = useMenuPlacement(ref, x, y);
  useMenuDismiss(ref, onClose);

  const act = (fn: () => void) => () => { fn(); onClose(); };
  const chevron = <ChevronRightIcon size={14} />;
  const radio = (on: boolean) => (
    <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full border-2 ${on ? 'border-lc-green bg-lc-green' : 'border-lc-muted'}`} />
  );

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={target.name}
      data-testid="channel-context-menu"
      className={`fixed z-[200] min-w-[240px] ${MENU_PANEL_CLASS}`}
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem
        icon={<CheckCircleIcon />}
        label={t('channelMenu.markRead')}
        disabled={!target.hasUnread}
        onClick={act(a.markRead)}
        testId="channel-menu-mark-read"
      />
      <MenuDivider />
      <MenuItem
        icon={<StarIcon filled={a.following} />}
        label={a.following ? t('channelMenu.unfollow') : t('channelMenu.follow')}
        onClick={act(a.toggleFollow)}
        testId="channel-menu-follow"
      />
      <MenuItem
        icon={<LinkIcon />}
        label={t('channelMenu.copyLink')}
        onClick={act(() => void a.copyLink())}
        testId="channel-menu-copy-link"
      />
      <MenuDivider />
      <div className="relative" onMouseEnter={() => setSub('mute')} onMouseLeave={() => setSub(null)}>
        {a.muted ? (
          <MenuItem
            icon={<BellIcon />}
            label={t('channelMenu.unmute')}
            hint={mutedLabel}
            onClick={act(a.unmute)}
            testId="channel-menu-unmute"
          />
        ) : (
          <MenuItem
            icon={<BellOffIcon />}
            label={t('channelMenu.mute')}
            trailing={chevron}
            onClick={() => setSub(sub === 'mute' ? null : 'mute')}
            buttonProps={{ 'aria-haspopup': 'menu', 'aria-expanded': sub === 'mute' }}
            testId="channel-menu-mute"
          />
        )}
        {!a.muted && sub === 'mute' && (
          <SubMenu flip={flipSub} testId="channel-menu-mute-sub">
            {MUTE_OPTIONS.map((o) => (
              <MenuItem
                key={o.key}
                icon={o.ms === MUTED_FOREVER ? <BellOffIcon /> : <ClockIcon />}
                label={t(o.key)}
                onClick={act(() => a.mute(o.ms))}
                testId={`channel-menu-mute-${o.ms}`}
              />
            ))}
          </SubMenu>
        )}
      </div>
      <div className="relative" onMouseEnter={() => setSub('notify')} onMouseLeave={() => setSub(null)}>
        <MenuItem
          icon={<BellIcon />}
          label={t('channelMenu.notify')}
          hint={t(`channelMenu.notify.${a.level}`)}
          trailing={chevron}
          onClick={() => setSub(sub === 'notify' ? null : 'notify')}
          buttonProps={{ 'aria-haspopup': 'menu', 'aria-expanded': sub === 'notify' }}
          testId="channel-menu-notify"
        />
        {sub === 'notify' && (
          <SubMenu flip={flipSub} testId="channel-menu-notify-sub">
            {NOTIFY_OPTIONS.map((o) => (
              <MenuItem
                key={o.level}
                role="menuitemradio"
                icon={o.level === 'all' ? <BellIcon /> : o.level === 'mentions' ? <AtIcon /> : <BellOffIcon />}
                label={t(o.key)}
                trailing={radio(a.level === o.level)}
                onClick={act(() => a.setLevel(o.level))}
                buttonProps={{ 'aria-checked': a.level === o.level }}
                testId={`channel-menu-notify-${o.level}`}
              />
            ))}
          </SubMenu>
        )}
      </div>
    </div>,
    document.body,
  );
}
