import { create } from 'zustand';

/**
 * What this browser has done with each invoice, keyed by payment hash (one
 * per invoice, however many times it is posted or rendered).
 *
 * `paying` is claimed synchronously before the wallet is asked, so a second
 * click, a re-render or a second card for the same invoice finds it taken.
 * `paid` is final: nothing here turns a paid invoice back into a payable one.
 *
 * Memory only, for this tab's session. After a reload a paid invoice shows
 * Pay again; a Lightning invoice can only be settled once, so the wallet
 * then fails rather than paying twice.
 */
export type InvoicePayment =
  | { status: 'paying' }
  | { status: 'paid'; payerPubkey: string | null; paidAt: number };

interface InvoicePaymentsState {
  byHash: Record<string, InvoicePayment>;
  /** Claims the invoice for one payment. False when it is already being paid or is paid. */
  claim: (paymentHash: string) => boolean;
  /** Gives a claim back after the wallet said no. Never undoes `paid`. */
  release: (paymentHash: string) => void;
  markPaid: (paymentHash: string, payerPubkey: string | null) => void;
  /** Forgets finished payments (logout); a payment still in flight keeps its claim. */
  forgetPaid: () => void;
}

export const useInvoicePaymentsStore = create<InvoicePaymentsState>()((set, get) => ({
  byHash: {},
  claim: (paymentHash) => {
    if (get().byHash[paymentHash]) return false;
    set((s) => ({ byHash: { ...s.byHash, [paymentHash]: { status: 'paying' } } }));
    return true;
  },
  release: (paymentHash) => set((s) => {
    if (s.byHash[paymentHash]?.status !== 'paying') return s;
    const { [paymentHash]: _gone, ...rest } = s.byHash;
    return { byHash: rest };
  }),
  markPaid: (paymentHash, payerPubkey) => set((s) => ({
    byHash: { ...s.byHash, [paymentHash]: { status: 'paid', payerPubkey, paidAt: Date.now() } },
  })),
  forgetPaid: () => set((s) => ({
    byHash: Object.fromEntries(Object.entries(s.byHash).filter(([, p]) => p.status === 'paying')),
  })),
}));
