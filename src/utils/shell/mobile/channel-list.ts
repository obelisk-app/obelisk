/** Shaping the phone shell's channel lists: lookups by id, roots, ids back to channels. */
import { shortHost } from '@/utils/relay-url/url-host';

/** A record of the items by id, the shape the channel pickers look channels up in. */
export function indexById<T extends { id: string }>(items: ReadonlyArray<T>): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

/**
 * The channels at the top of the list: no parent, or a parent this store
 * does not have (the desktop rail does the same, so categories match).
 */
export function rootChannels<T extends { id: string; parent: string | null }>(
  groups: ReadonlyArray<T>,
  byId: Readonly<Record<string, T>>,
): T[] {
  return groups.filter((g) => !g.parent || !byId[g.parent]);
}

/** The channels these ids name, in order, skipping any the store does not have. */
export function channelsFromIds<T>(ids: ReadonlyArray<string>, byId: Readonly<Record<string, T>>): T[] {
  return ids.map((id) => byId[id]).filter((g): g is T => !!g);
}

/** Flip one key of a boolean map. */
export function toggleKey(map: Readonly<Record<string, boolean>>, key: string): Record<string, boolean> {
  return { ...map, [key]: !map[key] };
}

/**
 * The active space's name: the operator's branding, then the NIP-11
 * document, then the relay host while everything resolves.
 */
export function spaceLabel(brandingName: string, infoName: string | undefined, relay: string | null | undefined): string {
  return brandingName || infoName || (relay ? shortHost(relay) : 'Obelisk'); // i18n-exempt: brand name
}
