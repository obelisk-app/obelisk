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
 * State lives in `src/store/chat/channel-prefs.ts`; the bridge's
 * `deliverGroupPing` is what honours it.
 */
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { MUTE_OPTIONS, NOTIFY_OPTIONS } from '@/constants/chat/channel';
import { MUTED_FOREVER } from '@/constants/chat/channel-prefs';
import { useChannelContextMenu } from '@/hooks/chat/channel/useChannelContextMenu';
import { MENU_PANEL_CLASS, MenuDivider, MenuItem } from '@/components/ui/overlays/menu';
import { AtIcon, BellIcon, BellOffIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, LinkIcon, StarIcon } from '@/assets/icons';
import type { ChannelMenuTarget } from '@/utils/chat/channel/channel-menu-options';
import { SubMenu } from './SubMenu';

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
  const t = useTranslations();
  const {
    closeSub, copyLink, flipSub, following, level, markRead, mute, muted, mutedLabel, openSub, pos, ref, setLevel, sub, toggleFollow, toggleSub, unmute,
  } = useChannelContextMenu(target, x, y, onClose);
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
        label={t('chat.channelMenu.markRead')}
        disabled={!target.hasUnread}
        onClick={markRead}
        testId="channel-menu-mark-read"
      />
      <MenuDivider />
      <MenuItem
        icon={<StarIcon filled={following} />}
        label={following ? t('chat.channelMenu.unfollow') : t('chat.channelMenu.follow')}
        onClick={toggleFollow}
        testId="channel-menu-follow"
      />
      <MenuItem
        icon={<LinkIcon />}
        label={t('chat.channelMenu.copyLink')}
        onClick={copyLink}
        testId="channel-menu-copy-link"
      />
      <MenuDivider />
      <div className="relative" onMouseEnter={() => openSub('mute')} onMouseLeave={closeSub}>
        {muted ? (
          <MenuItem
            icon={<BellIcon />}
            label={t('chat.channelMenu.unmute')}
            hint={mutedLabel}
            onClick={unmute}
            testId="channel-menu-unmute"
          />
        ) : (
          <MenuItem
            icon={<BellOffIcon />}
            label={t('chat.channelMenu.mute.label')}
            trailing={chevron}
            onClick={() => toggleSub('mute')}
            buttonProps={{ 'aria-haspopup': 'menu', 'aria-expanded': sub === 'mute' }}
            testId="channel-menu-mute"
          />
        )}
        {!muted && sub === 'mute' && (
          <SubMenu flip={flipSub} testId="channel-menu-mute-sub">
            {MUTE_OPTIONS.map((o) => (
              <MenuItem
                key={o.key}
                icon={o.ms === MUTED_FOREVER ? <BellOffIcon /> : <ClockIcon />}
                label={t(o.key)}
                onClick={() => mute(o.ms)}
                testId={`channel-menu-mute-${o.ms}`}
              />
            ))}
          </SubMenu>
        )}
      </div>
      <div className="relative" onMouseEnter={() => openSub('notify')} onMouseLeave={closeSub}>
        <MenuItem
          icon={<BellIcon />}
          label={t('chat.channelMenu.notify.label')}
          hint={t(`chat.channelMenu.notify.${level}`)}
          trailing={chevron}
          onClick={() => toggleSub('notify')}
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
                trailing={radio(level === o.level)}
                onClick={() => setLevel(o.level)}
                buttonProps={{ 'aria-checked': level === o.level }}
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
