import { prisma } from '@/lib/db';

export const MAX_TAG_NAME_LENGTH = 32;
const DEFAULT_TAG_COLOR = '#b4f953';

function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if ([...trimmed].length > MAX_TAG_NAME_LENGTH) return null;
  return trimmed;
}

// Resolve tag IDs from a mix of existing IDs and free-form names.
// Names not yet present on the channel are created on demand. Names matching
// an existing tag (case-sensitive, per schema unique constraint) resolve to
// its ID. Duplicates are de-duplicated. Unknown IDs are silently dropped.
export async function resolveForumTagIds(
  channelId: string,
  tagIds: unknown,
  tagNames: unknown,
): Promise<string[]> {
  const idList = Array.isArray(tagIds)
    ? tagIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];
  const rawNames = Array.isArray(tagNames) ? tagNames : [];
  const names = Array.from(
    new Set(
      rawNames
        .map(normalizeTagName)
        .filter((n): n is string => n !== null),
    ),
  );

  const result = new Set<string>();

  if (idList.length > 0) {
    const rows = await prisma.forumTag.findMany({
      where: { channelId, id: { in: idList } },
      select: { id: true },
    });
    rows.forEach((r) => result.add(r.id));
  }

  if (names.length > 0) {
    const existing = await prisma.forumTag.findMany({
      where: { channelId, name: { in: names } },
      select: { id: true, name: true },
    });
    const byName = new Map(existing.map((r) => [r.name, r.id]));
    const missing = names.filter((n) => !byName.has(n));

    if (missing.length > 0) {
      const maxPos = await prisma.forumTag.findFirst({
        where: { channelId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      let nextPos = (maxPos?.position ?? -1) + 1;
      for (const name of missing) {
        try {
          const created = await prisma.forumTag.create({
            data: { channelId, name, color: DEFAULT_TAG_COLOR, position: nextPos++ },
            select: { id: true, name: true },
          });
          byName.set(created.name, created.id);
        } catch {
          // Race: another request created the same (channelId,name). Re-read.
          const row = await prisma.forumTag.findUnique({
            where: { channelId_name: { channelId, name } },
            select: { id: true },
          });
          if (row) byName.set(name, row.id);
        }
      }
    }

    names.forEach((n) => {
      const id = byName.get(n);
      if (id) result.add(id);
    });
  }

  return Array.from(result);
}
