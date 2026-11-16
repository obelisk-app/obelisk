import type { Rumor } from '@applesauce/concord';
import type { JsGroup, JsMessage } from '@/services/nostr-bridge';
import { concordMessage } from './presentation';
import type { projectConcordTimeline } from './timeline';

export function concordThreadId(channelId: string, rumorId: string) { return `${channelId}:thread:${rumorId}`; }
export function concordThreadMessages(rows: ReturnType<typeof projectConcordTimeline>, root: Rumor) {
  const ids = new Set([root.id]);
  const children = new Map<string, string[]>();
  for (const { rumor } of rows) for (const tag of rumor.tags) {
    if (tag[0] !== 'E' && tag[0] !== 'e' && tag[0] !== 'q') continue;
    const list = children.get(tag[1]) ?? [];
    list.push(rumor.id);
    children.set(tag[1], list);
  }
  const queue = [root.id];
  for (let index = 0; index < queue.length; index++) {
    for (const id of children.get(queue[index]) ?? []) if (!ids.has(id)) { ids.add(id); queue.push(id); }
  }
  return rows.filter(row => ids.has(row.rumor.id)).map(concordMessage);
}
export function concordPublicationData(group: JsGroup | undefined, rows: ReturnType<typeof projectConcordTimeline>) {
  const groups: JsGroup[] = [];
  const messagesByGroup: Record<string, JsMessage[]> = {};
  if (!group || group.kind !== 'forum') return { groups, messagesByGroup };
  for (const row of rows) {
    if (row.rumor.kind !== 9 || row.rumor.tags.some(tag => tag[0] === 'q' || tag[0] === 'e' && tag[3] === 'reply')) continue;
    const id = concordThreadId(group.id, row.rumor.id);
    groups.push({ ...group, id, parent: group.id, kind: 'text', name: row.subject || row.content.split('\n')[0].slice(0, 100) });
    messagesByGroup[id] = concordThreadMessages(rows, row.rumor);
  }
  return { groups, messagesByGroup };
}
