'use client';

import { switchRelayFromRail } from '@/services/shell/desktop/rail-relay';
import type { View } from '@/utils/shell/desktop/view';

/**
 * The desktop drawer's handlers: every pick on the rail or in the list sets
 * the view and closes the drawer (a no-op on a wide window, where the drawer
 * is inline).
 */
export function useDesktopDrawer({ relay, setView, closeDrawer }: {
  relay: string;
  setView: (v: View) => void;
  closeDrawer: () => void;
}) {
  return {
    pickDm: () => {
      setView({ kind: 'dm', peer: null });
      closeDrawer();
    },
    /** Clears the view first, so the old relay's channel is not drawn over the new relay. */
    pickRelay: async (url: string) => {
      setView({ kind: 'empty' });
      await switchRelayFromRail(url, relay);
      closeDrawer();
    },
    pickPeer: (peer: string) => {
      setView({ kind: 'dm', peer });
      closeDrawer();
    },
    pickView: (v: View) => {
      setView(v);
      closeDrawer();
    },
  };
}
