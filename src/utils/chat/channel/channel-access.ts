/**
 * A channel's access preset, the one choice both settings screens offer, and
 * the four NIP-29 flags each preset stands for. The relay enforces the flags;
 * the preset is how a person reads them.
 */
export type ChannelAccess = 'public' | 'read-only' | 'private';

/** The preset a group's flags show: not public is private, public but restricted is read-only. */
export function accessOf(group: { isPublic: boolean; isRestricted: boolean }): ChannelAccess {
  if (!group.isPublic) return 'private';
  return group.isRestricted ? 'read-only' : 'public';
}

/** The flags a preset publishes. */
export function accessFlags(access: ChannelAccess) {
  return {
    isPublic: access !== 'private',
    isHidden: access === 'private',
    isRestricted: access !== 'public',
    isOpen: access === 'public',
  };
}
