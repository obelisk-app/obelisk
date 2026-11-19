'use client';

import { Fragment } from 'react';
import { type JsGroup } from '@/services/nostr-bridge';
import { ForumThreadChildRow } from './ForumThreadChildRow';
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
  threads: ReadonlyArray<{ group: JsGroup; showAsChannel: boolean }>;
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
          {threads.map(({ group: child, showAsChannel }) => (
            <Fragment key={child.id}>
              {showAsChannel ? (
                <ChannelRow group={child} live={false} onClick={() => onOpen(child)} indent />
              ) : (
                <ForumThreadChildRow group={child} active={false} onClick={() => onOpen(child)} />
              )}
            </Fragment>
          ))}
        </div>
      )}
    </>
  );
}
