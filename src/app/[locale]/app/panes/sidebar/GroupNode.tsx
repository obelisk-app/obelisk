'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { ChannelContextMenu } from '@/components/chat/channel/ChannelContextMenu';
import { useTranslations } from 'next-intl';
import type { View } from '@/utils/shell/desktop/view';
import { useGroupNode } from '@/hooks/shell/panes/sidebar/useGroupNode';
import { ActiveCallBadge } from './ActiveCallBadge';
import { ForumThreadRow } from './ForumThreadRow';
import { ChevronRightIcon } from '@/assets/icons';

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
}: {
  group: JsGroup;
  depth: number;
  childrenByParent: Readonly<Record<string, ReadonlyArray<string>>>;
  groupsById: Readonly<Record<string, JsGroup>>;
  view: View;
  onSelect: (id: string) => void;
  distanceById?: Readonly<Record<string, number | null>>;
}) {
  const t = useTranslations();
  const vm = useGroupNode({ group, view, depth, childrenByParent, groupsById, distanceById });
  const childProps = { depth: depth + 1, childrenByParent, groupsById, view, onSelect, distanceById };
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
        {depth > 0 && !vm.isCollapsible && <span className="pl-1 text-lc-muted lc-tree-marker">↳</span>}
        <button
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
            <span
              aria-label={t('shell.desktop.channels.unread', { count: vm.unread })}
              className="text-xs tabular-nums text-lc-muted"
            >
              {vm.unread > 99 ? '99+' : vm.unread}
            </span>
          )}
          {vm.mentionsOrReplies > 0 && (
            <span
              aria-label={t('shell.desktop.channels.mentions', { count: vm.mentionsOrReplies })}
              className="rounded-full bg-lc-green px-1.5 py-px text-[10px] font-bold text-lc-black"
            >
              {vm.mentionsOrReplies > 99 ? '99+' : vm.mentionsOrReplies}
            </span>
          )}
        </button>
        {vm.isCollapsible && (
          <button
            onClick={vm.toggleCollapsed}
            className="flex shrink-0 items-center justify-center px-2 py-1.5 text-lc-white/70 hover:text-lc-green"
            aria-label={vm.collapsed ? t('shell.desktop.channels.expandPublications') : t('shell.desktop.channels.collapsePublications')}
            title={vm.collapsed ? t('shell.desktop.channels.expandPublications') : t('shell.desktop.channels.collapsePublications')}
          >
            <ChevronRightIcon size={null} strokeWidth={2.5} className={`h-3.5 w-3.5 transition-transform duration-150 ${vm.collapsed ? '' : 'rotate-90'}`} />
          </button>
        )}
      </div>
      {!vm.collapsed && (group.kind === 'forum' ? (
        // Forum threads get the Discord-style L-rail treatment: wrap them in
        // .lc-forum-threads so each row's ::before/::after can paint a
        // continuous vertical rail terminating in an L-corner at the last row.
        <div className="lc-forum-threads">
          {vm.children.map((child) => (
            <ForumThreadRow key={child.id} groupId={child.id}>
              <GroupNode group={child} {...childProps} />
            </ForumThreadRow>
          ))}
        </div>
      ) : (
        vm.children.map((child) => <GroupNode key={child.id} group={child} {...childProps} />)
      ))}
    </>
  );
}
