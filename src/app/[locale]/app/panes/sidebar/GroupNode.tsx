'use client';

import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';
import type { JsGroup } from '@/services/nostr-bridge';
import { ChannelContextMenu } from '@/components/chat/channel/ChannelContextMenu';
import { useTranslations } from 'next-intl';
import type { View } from '@/utils/shell/desktop/view';
import { useGroupNode } from '@/hooks/shell/panes/sidebar/useGroupNode';
import { PublicCallPreview } from '@/components/voice/room/PublicCallPreview';
import { ActiveCallBadge } from './ActiveCallBadge';

/**
 * One channel in the desktop sidebar, with its children under it: a
 * publication's threads on an L-rail (foldable), or nested channels. State
 * and handlers come from `useGroupNode`.
 */
export function GroupNode({
  group,
  depth,
  childrenByParent,
  groupsById,
  view,
  onSelect,
  distanceById,
  recentSubchannelIds,
}: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Readonly<Record<string, JsGroup>>;
  view: View;
  onSelect: (id: string) => void;
  recentSubchannelIds?: ReadonlySet<string>;
  distanceById?: Readonly<Record<string, number | null>>;
}) {
  const t = useTranslations();
  const vm = useGroupNode({ group, view, depth, childrenByParent, groupsById, distanceById, recentSubchannelIds });
  const expandLabel = recentSubchannelIds
    ? t(vm.collapsed ? 'common.subchannels.showAll' : 'common.subchannels.showRecent')
    : t(vm.collapsed ? 'shell.desktop.channels.expandPublications' : 'shell.desktop.channels.collapsePublications');
  const childProps = { depth: depth + 1, childrenByParent, groupsById, view, onSelect, distanceById, recentSubchannelIds };
  return (
    <>
      <div
        style={{ paddingLeft: vm.indent }}
        className={
          'flex w-full items-center gap-1 rounded text-left text-base transition ' +
          (vm.active
            ? 'bg-lc-olive text-lc-white'
            : 'text-lc-muted hover:bg-lc-card hover:text-lc-white') +
          (vm.dimmed ? ' opacity-55' : '')
        }
        onContextMenu={vm.openMenu}
        data-testid={`channel-row-${group.id}`}
      >
        {vm.menuAt && vm.menuTarget && (
          <ChannelContextMenu
            target={vm.menuTarget}
            x={vm.menuAt.x}
            y={vm.menuAt.y}
            onClose={vm.closeMenu}
          />
        )}
        {depth > 0 && <span aria-hidden="true" className="pl-1 text-lc-muted lc-tree-marker">↳</span>}
        <Button
          variant="bare"
          onClick={() => onSelect(group.id)}
          className="flex flex-1 items-center gap-2 truncate px-1 py-1.5 text-left"
        >
          <span className="text-lc-muted">#</span>
          <span
            className={`flex-1 truncate ${vm.unread > 0 ? 'font-semibold text-lc-white' : ''} ${vm.wotClass}`}
            title={vm.wotTitle}
          >
            {vm.label}
          </span>
          {!group.isPublic && <span title={t('mobile.channel.private')} className="text-[10px]">🔒</span>}
          {!group.isOpen && <span title={t('shell.desktop.channel.closed')} className="text-[10px]">⊝</span>}
          <ActiveCallBadge groupId={group.id} kind={group.kind} />
          {vm.muted && <span title={t('chat.channelMenu.muted')} aria-label={t('chat.channelMenu.muted')} className="text-[11px]">🔕</span>}
          {vm.unread > 0 && (
            <Text variant="caption"
              aria-label={t('shell.desktop.channels.unread', { count: vm.unread })}
              className="tabular-nums">
              {vm.unread > 99 ? '99+' : vm.unread}
            </Text>
          )}
          {vm.mentionsOrReplies > 0 && (
            <span
              aria-label={t('shell.desktop.channels.mentions', { count: vm.mentionsOrReplies })}
              className="rounded-full bg-lc-green px-1.5 py-px text-[10px] font-bold text-lc-black"
            >
              {vm.mentionsOrReplies > 99 ? '99+' : vm.mentionsOrReplies}
            </span>
          )}
        </Button>
        {vm.isCollapsible && (
          <Button
            variant="bare"
            onClick={vm.toggleCollapsed}
            className="flex shrink-0 items-center justify-center rounded px-2 py-1.5 text-lc-muted hover:bg-lc-card hover:text-lc-green aria-expanded:text-lc-green focus-visible:outline-2 focus-visible:outline-lc-green"
            aria-label={expandLabel}
            aria-expanded={!vm.collapsed}
            title={expandLabel}
          >
            <span className="channel-expand-triangle" aria-hidden="true" />
          </Button>
        )}
      </div>
      {(group.kind === 'voice' || group.kind === 'voice-sfu') && group.isPublic && !group.isHidden && (
        <div style={{ paddingLeft: vm.indent }}><PublicCallPreview groupId={group.id} menu /></div>
      )}
      {(!vm.collapsed || recentSubchannelIds) && (group.kind === 'forum' && vm.children.length > 0 ? (
        // Forum threads get the Discord-style L-rail treatment: wrap them in
        // .lc-forum-threads so each row's ::before/::after can paint a
        // continuous vertical rail terminating in an L-corner at the last row.
        <div className="lc-forum-threads">
          {vm.children.map((child) => (
            <div key={child.id} className="lc-thread-row">
              <GroupNode group={child} {...childProps} />
            </div>
          ))}
        </div>
      ) : (
        vm.descendants.map((row) => (
          <GroupNode key={row.group.id} group={row.group} {...childProps} depth={row.depth} />
        ))
      ))}
    </>
  );
}
