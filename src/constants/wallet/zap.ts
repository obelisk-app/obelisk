/**
 * Wallet: zap. Values the code in `services/wallet/send-zap.ts` reads, kept
 * here so every reader imports the one copy.
 */

/** The amount pre-filled when a zap opens without one, in sats. */
export const DEFAULT_ZAP_AMOUNT_SATS = 21;

/** `markerError` when there was no bridge to post the marker with; the UI words it. */
export const MARKER_NO_BRIDGE = 'no-bridge';

export const DEFAULT_ZAP_PRESETS = [
  { emoji: '⚡', amountSats: DEFAULT_ZAP_AMOUNT_SATS },
  { emoji: '🔥', amountSats: 210 },
  { emoji: '💎', amountSats: 420 },
];
