/**
 * Nostr Wallet Connect (NIP-47), client side: parse a connection URI, read
 * the wallet's info event, and call `pay_invoice` / `get_info` /
 * `get_budget` over a transport the caller supplies.
 *
 * Why not `@nostr-wot/wallet`'s `NwcClient`: it opens its own `SimplePool`
 * unless handed one, speaks only NIP-04 whatever the wallet advertises,
 * waits a fixed 30 s, sends no `expiration`, and reports a wallet error only
 * as English text. This one rides the caller's transport, picks NIP-44 when
 * the wallet offers it, and says with every failure whether money may have
 * moved.
 *
 * Imports only `nostr-tools` and itself: a mini-package.
 */
export { NwcError, codeForWalletError, mayHavePaid } from './errors';
export type { NwcErrorCode, NwcOutcome } from './errors';
export { parseNwcUri, MAX_NWC_RELAYS } from './uri';
export type { NwcConnection } from './uri';
export { NWC_KINDS, canPay, chooseEncryption, parseNwcInfo } from './info';
export type { NwcEncryption, NwcInfo } from './info';
export { NwcClient, DEFAULT_NWC_TIMEOUTS } from './client';
export type { NwcBudget, NwcPayResult, NwcSubscription, NwcTimeouts, NwcTransport } from './client';
