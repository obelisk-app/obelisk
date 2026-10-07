import { NO_CATEGORY } from '@/constants/shell/mobile';

/** The picker's options: "no category" (labelled by the caller) first, then the draft's categories in order. */
export function categoryOptions(
  categories: ReadonlyArray<{ id: string; name: string }>,
  uncategorizedLabel: string,
): Array<{ id: string; name: string }> {
  return [
    { id: NO_CATEGORY, name: uncategorizedLabel },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];
}

/** The category a picked option stands for: `null` for "no category", never the sentinel. */
export function categoryIdFromOption(value: string): string | null {
  return value === NO_CATEGORY ? null : value;
}

/**
 * A category block's rows: each id that names a known channel, with whether
 * it sits first or last in the category (counted over the ids, so a channel
 * the store does not know yet still holds its place).
 */
export function categoryChannelRows<T>(
  channelIds: ReadonlyArray<string>,
  channelsById: Readonly<Record<string, T>>,
): Array<{ id: string; channel: T; first: boolean; last: boolean }> {
  return channelIds.flatMap((id, i) => {
    const channel = channelsById[id];
    return channel ? [{ id, channel, first: i === 0, last: i === channelIds.length - 1 }] : [];
  });
}
