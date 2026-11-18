import type { JsGroup } from '@/services/nostr-bridge';

/** Navigation projection of relay metadata. Publications are roots and their rows are leaves. */
export function channelHierarchy(groups: ReadonlyArray<JsGroup>) {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const parents = new Map<string, string>();
  for (const group of groups) {
    const parent = group.parent ? byId.get(group.parent) : undefined;
    const grandparent = parent?.parent ? byId.get(parent.parent) : undefined;
    if (group.kind !== 'forum' && parent && parent.id !== group.id
      && (parent.kind === 'forum' || grandparent?.kind !== 'forum')) {
      parents.set(group.id, parent.id);
    }
  }

  const visited = new Set<string>();
  for (const group of groups) {
    const path = new Set<string>();
    let id: string | undefined = group.id;
    while (id !== undefined && !visited.has(id) && !path.has(id)) {
      path.add(id);
      id = parents.get(id);
    }
    while (id !== undefined && path.has(id)) {
      const next = parents.get(id);
      parents.delete(id);
      id = next;
    }
    for (const member of path) visited.add(member);
  }

  const roots: JsGroup[] = [];
  const mobileRoots: JsGroup[] = [];
  const childrenByParent: Record<string, string[]> = Object.create(null);
  for (const group of groups) {
    const parent = parents.get(group.id);
    if (parent === undefined) roots.push(group);
    else (childrenByParent[parent] ??= []).push(group.id);
    if (parent === undefined || byId.get(parent)?.kind !== 'forum') mobileRoots.push(group);
  }
  for (const children of Object.values(childrenByParent)) children.sort();
  return { roots, mobileRoots, childrenByParent };
}
