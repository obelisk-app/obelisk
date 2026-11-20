'use client';

import { type JsGroup } from '@/services/nostr-bridge';
import { ChannelRow } from './ChannelRow';

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
      {threads.length > 0 && (
        <div className="forum-threads">
          {threads.map((child) => (
            <ChannelRow key={child.id} group={child} live={false} onClick={() => onOpen(child)} indent />
          ))}
        </div>
      )}
    </>
  );
}
