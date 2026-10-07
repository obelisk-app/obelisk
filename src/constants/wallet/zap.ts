/**
 * Wallet: zap. Values the code in `services/wallet/send-zap.ts` reads, kept
 * here so every reader imports the one copy.
 */

/** The amount pre-filled when a zap opens without one, in sats. */
export const DEFAULT_ZAP_AMOUNT_SATS = 100;

/** One-tap amounts offered under the amount field, in sats. */
export const ZAP_QUICK_AMOUNTS_SATS: readonly number[] = [21, 100, 500, 1000, 5000, 21000];

/** `markerError` when there was no bridge to post the marker with; the UI words it. */
export const MARKER_NO_BRIDGE = 'no-bridge';
