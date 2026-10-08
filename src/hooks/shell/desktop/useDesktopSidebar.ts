'use client';

import { switchRelayFromRail } from '@/services/shell/desktop/rail-relay';
import type { View } from '@/utils/shell/desktop/view';

/** Rail and list navigation; clear the old view before switching relays. */
export function useDesktopSidebar({ relay, setView }: {
  relay: string;
  setView: (v: View) => void;
}) {
  return {
    pickDm: () => {
      setView({ kind: 'dm', peer: null });
    },
    /** Clears the view first, so the old relay's channel is not drawn over the new relay. */
    pickRelay: async (url: string) => {
      setView({ kind: 'empty' });
      await switchRelayFromRail(url, relay);
    },
    pickPeer: (peer: string) => {
      setView({ kind: 'dm', peer });
    },
  };
}
