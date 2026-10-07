'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { ChannelRow } from './ChannelRow';
import { ForumThreadChildRow } from './ForumThreadChildRow';

/** One channel in the server list, plus a forum's threads under it while it is expanded. */
export function ServerChannelEntry({
  group,
  live,
  expandable,
  expanded,
  threads,
  onToggleExpand,
  onOpen,
}: {
  group: JsGroup;
  live: boolean;
  expandable: boolean;
  expanded: boolean;
  threads: ReadonlyArray<JsGroup>;
  onToggleExpand?: () => void;
  onOpen: (g: JsGroup) => void;
}) {
  return (
    <>
      <ChannelRow
        group={group}
        live={live}
        onClick={() => onOpen(group)}
        expandable={expandable}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
      />
      {expanded && (
        <div className="forum-threads">
          {threads.map((child) => (
            <ForumThreadChildRow key={child.id} group={child} active={false} onClick={() => onOpen(child)} />
          ))}
        </div>
      )}
    </>
  );
}
