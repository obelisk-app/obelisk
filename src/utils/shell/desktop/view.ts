import type { SurfaceId } from '@/utils/hints/registry';
export type View =
  | { kind: 'group'; groupId: string }
  | { kind: 'dm'; peer: string | null }
  | { kind: 'feed' }
  | { kind: 'empty' };

/**
 * Which surface the hints should be talking about.
 *
 * The desktop shell has no single "screen": it has a view plus panes, so
 * this maps that to the same surface ids the mobile nav uses, and the
 * registry is shared.
 */
export function surfaceForView(
  view: View,
  panes: { feedOpen: boolean; exploredProfilePubkey: string | null },
): SurfaceId | null {
  // A pane on top of the view is what the reader is actually looking at.
  if (panes.exploredProfilePubkey) return 'settings-profile';
  if (panes.feedOpen || view.kind === 'feed') return 'feed';
  if (view.kind === 'dm') return 'dms-list';
  if (view.kind === 'group') return 'channel';
  return 'server';
}

/** True while the open view is the voice channel the user is in, whose own pane shows the call. */
export function isViewingActiveCall(view: View, currentVoiceChannelId: string | null): boolean {
  return view.kind === 'group' && !!currentVoiceChannelId && view.groupId === currentVoiceChannelId;
}
