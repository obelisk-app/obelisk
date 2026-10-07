'use client';

import { ChannelActionSheet } from '@/components/chat/channel/ChannelContextMenu';
import { useChannelRow } from '@/hooks/shell/mobile/screens/server/useChannelRow';
import { ChannelRowBody, type ChannelRowProps } from './ChannelRowBody';

/**
 * A channel in the phone list, with the channel menu on a long press or a
 * right-click (`useChannelRow`). `display: contents` keeps the wrapper out
 * of the list's layout; voice channels have no menu.
 */
export function ChannelRow(props: ChannelRowProps) {
  const row = useChannelRow(props.group);
  if (!row.hasMenu) return <ChannelRowBody {...props} />;
  return (
    <div
      style={{ display: 'contents' }}
      data-testid={`channel-row-menu-${props.group.id}`}
      onContextMenu={row.onContextMenu}
      onTouchStart={row.onTouchStart}
      onTouchEnd={row.cancelPress}
      onTouchMove={row.cancelPress}
      onTouchCancel={row.cancelPress}
      onClickCapture={row.onClickCapture}
    >
      <ChannelRowBody {...props} />
      {row.menuOpen && <ChannelActionSheet target={row.target} onClose={row.closeMenu} />}
    </div>
  );
}
