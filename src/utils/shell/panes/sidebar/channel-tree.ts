import type { JsGroup } from '@/services/nostr-bridge';
import type { LaidOutSidebar } from '@/services/relay/channel-layout';

/**
 * The desktop channel tree, shaped for the markup: each category with the
 * channels this client knows, then the ones no category claims. Pure.
 */

/** The fold key of the "Uncategorized" section. */
export const UNCATEGORIZED_ID = '__uncat__';

/** The groups behind a list of ids, in order, skipping ids this client has no group for. */
export function knownGroups(ids: ReadonlyArray<string>, groupsById: Readonly<Record<string, JsGroup>>): JsGroup[] {
  return ids.flatMap((id) => groupsById[id] ?? []);
}

export interface ChannelTreeCategory {
  readonly id: string;
  /** The operator's name for it, before `categoryLabel` localises the defaults. */
  readonly name: string;
  /** Every channel the layout puts here, known to this client or not. */
  readonly channelCount: number;
  readonly groups: ReadonlyArray<JsGroup>;
}

export interface ChannelTreeSections {
  readonly categories: ReadonlyArray<ChannelTreeCategory>;
  readonly uncategorized: ReadonlyArray<JsGroup>;
  readonly uncategorizedCount: number;
  /** The uncategorized channels get a header of their own only when there are categories beside them. */
  readonly uncategorizedHeaded: boolean;
}

export function channelTreeSections(
  laidOut: LaidOutSidebar,
  groupsById: Readonly<Record<string, JsGroup>>,
): ChannelTreeSections {
  return {
    categories: laidOut.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      channelCount: cat.channelIds.length,
      groups: knownGroups(cat.channelIds, groupsById),
    })),
    uncategorized: knownGroups(laidOut.uncategorized, groupsById),
    uncategorizedCount: laidOut.uncategorized.length,
    uncategorizedHeaded: laidOut.categories.length > 0,
  };
}
