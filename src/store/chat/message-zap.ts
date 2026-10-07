'use client';

import { create } from 'zustand';

export interface ZapTarget {
  /** Omit to zap the user (no `e` tag) rather than a specific message. */
  messageId?: string | null;
  recipientPubkey: string;
  /** Optional fallback when bridge metadata hasn't been fetched yet. */
  recipientLud16?: string | null;
  displayName: string;
  groupId: string;
  defaultAmountSats?: number;
}

interface MessageZapState {
  target: ZapTarget | null;
  open: (target: ZapTarget) => void;
  close: () => void;
}

export const useMessageZapStore = create<MessageZapState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}));
