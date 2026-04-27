import type { StateCreator } from 'zustand';
import type { ChatState } from './index';
import type { EphemeralMessage, InvoicePayment } from './types';

export interface EphemeralSlice {
  // Self-only "ephemeral" notices shown inline in the chat pane (e.g.
  // `/balance` output, "@user hasn't set up NWC" hints). Keyed by channelId.
  // Never hits the server; cleared on channel switch.
  ephemeralMessages: Record<string, EphemeralMessage[]>;
  pushEphemeral: (channelId: string, text: string) => void;
  dismissEphemeral: (channelId: string, id: string) => void;
  clearEphemeral: (channelId: string) => void;

  // Paid-invoice state keyed by paymentHash. Populated by the Socket.io
  // `invoice-paid` handler; InvoiceCard components read this to flip into
  // the "Paid" state in real-time.
  invoicePayments: Record<string, InvoicePayment>;
  markInvoicePaid: (entry: InvoicePayment) => void;
}

export const EPHEMERAL_INITIAL_STATE = {
  ephemeralMessages: {} as Record<string, EphemeralMessage[]>,
  invoicePayments: {} as Record<string, InvoicePayment>,
};

export const createEphemeralSlice: StateCreator<ChatState, [], [], EphemeralSlice> = (set) => ({
  ...EPHEMERAL_INITIAL_STATE,

  pushEphemeral: (channelId, text) => set((state) => {
    const list = state.ephemeralMessages[channelId] ?? [];
    const next: EphemeralMessage = {
      id: `eph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      createdAt: new Date().toISOString(),
    };
    return { ephemeralMessages: { ...state.ephemeralMessages, [channelId]: [...list, next] } };
  }),
  dismissEphemeral: (channelId, id) => set((state) => {
    const list = state.ephemeralMessages[channelId];
    if (!list) return state;
    const filtered = list.filter((e) => e.id !== id);
    if (filtered.length === list.length) return state;
    if (filtered.length === 0) {
      const next = { ...state.ephemeralMessages };
      delete next[channelId];
      return { ephemeralMessages: next };
    }
    return { ephemeralMessages: { ...state.ephemeralMessages, [channelId]: filtered } };
  }),
  clearEphemeral: (channelId) => set((state) => {
    if (!state.ephemeralMessages[channelId]) return state;
    const next = { ...state.ephemeralMessages };
    delete next[channelId];
    return { ephemeralMessages: next };
  }),

  markInvoicePaid: (entry) => set((state) => ({
    invoicePayments: { ...state.invoicePayments, [entry.paymentHash]: entry },
  })),
});
