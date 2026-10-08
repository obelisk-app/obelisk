# Bitcoin zaps and invoices

Obelisk pays Lightning from chat in two places: a **zap** on a message or a
person, and the **Pay** button on a BOLT11 invoice someone posted in a
channel. Both pay through the same wallet path, and there is no other.

## The wallet path

`src/services/wallet/wallet.ts` is the one module that talks to a wallet.
It picks one, by one rule:

1. the account's **Nostr Wallet Connect** (NIP-47) wallet, when one is
   connected in Settings > Wallet;
2. otherwise a **WebLN** browser extension (Alby and similar), which puts a
   provider on `window.webln`;
3. otherwise no wallet.

The connected wallet wins because connecting one is a choice made in this
app, while an extension is merely installed. Settings ("Payments now use:
..."), the zap modal and the invoice confirm all say which wallet will pay
(`PayingWalletNote`, `usePayingWallet`).

- `walletKindFor(account)` / `isWalletAvailable(account)`: which wallet
  would pay, without asking it anything. A sealed NWC record this page has
  not opened yet counts.
- `connectWallet(account)`: the connected NWC wallet (opening its sealed
  record first if needed), else WebLN after `enable()`, else `null`. It
  returns `{ kind, pay(invoice) }`.

Both backends take only the invoice, so an invoice that sets no amount
cannot be paid here; the card says so instead of offering Pay.

## Nostr Wallet Connect

### Connecting

Settings > Wallet (desktop sidebar; on the phone, the preferences screen).
The person pastes the `nostr+walletconnect://` link their wallet gives them.

- While typing, the link is checked locally (`parseNwcUri`, no network):
  a 64-hex wallet key, a 64-hex secret, one to three `wss://` relays
  (`ws://` only for localhost), an optional `lud16`. The card shows which
  wallet and which relay it points to.
- **Connect** reads the wallet's info event (kind 13194). The connection is
  refused when the wallet cannot be reached (`nwc-unreachable`) or the
  connection may not call `pay_invoice` (`nwc-cannot-pay`). When the
  connection may call them, `get_info` gives the wallet's name and
  `get_budget` its spending limit for this app; both are optional.
- A short warning sits above the field: connecting lets Obelisk spend from
  that wallet up to the limits set in the wallet, and anyone with the link
  can do the same.
- Connected, the card shows the wallet, the relay, the budget when the
  wallet reports one, whether the connection is stored, and Disconnect.

### The protocol (`src/lib/nwc/`)

A mini-package (imports only `nostr-tools`) with a client that never opens
a socket: it asks a transport the caller supplies. One call:

1. read the info event once; use NIP-44 (`nip44_v2`) when its `encryption`
   tag offers it, else NIP-04 (a wallet with no tag speaks only NIP-04);
2. open a live REQ for the answer (kind 23195, from the wallet, `#p` the
   client key, `#e` the request) and wait for EOSE: the answer is
   ephemeral, so a REQ opened late would miss it;
3. publish the request (kind 23194), signed by the connection's client
   key, with an `expiration` tag, so a wallet that receives it after the
   app stopped waiting does not act on it;
4. resolve with `result`, or reject with an `NwcError`.

Timeouts: 8 s for the info event, 60 s for `pay_invoice`, 12 s for the
other calls. NIP-47 error codes become the app's error codes
(`codeForWalletError`), translated in `errors.codes`:

| Wallet says | Code | Reader sees |
|---|---|---|
| `INSUFFICIENT_BALANCE` | `wallet-insufficient-balance` | Your wallet does not have enough funds. |
| `QUOTA_EXCEEDED` | `wallet-quota-exceeded` | This would go over the spending limit your wallet set for Obelisk. |
| `RATE_LIMITED` | `wallet-rate-limited` | Your wallet is getting too many requests. ... |
| `UNAUTHORIZED` | `wallet-unauthorized` | Your wallet no longer accepts this connection. Connect it again in Settings. |
| `RESTRICTED` | `wallet-restricted` | Your wallet does not allow this connection to make that payment. |
| `PAYMENT_FAILED` | `wallet-payment-failed` | Your wallet tried the payment and it failed. Nothing was paid. |
| `NOT_IMPLEMENTED`, `UNSUPPORTED_ENCRYPTION` | `wallet-not-supported` | Your wallet does not support this request. |
| anything else | `wallet-failed` | Your wallet reported an error. |
| (no answer in time) | `wallet-timeout` | ... The payment may still go through: check your wallet before trying again. |
| (no relay took the request) | `wallet-relay-failed` | Could not reach your wallet's relay. Nothing was paid. |

Every `NwcError` also says whether money may have moved (`outcome`):
`not-paid` when the request never reached the wallet or the wallet
answered with an error, `unknown` when it was sent and no usable answer
came back (`mayHavePaid(err)`).

Why not the SDK's `NwcClient` (`@nostr-wot/wallet`): it opens its own
`SimplePool` unless handed one, speaks only NIP-04 whatever the wallet
advertises, waits a fixed 30 s, sends no `expiration`, and reports a wallet
error only as English text.

### Relays: through the hub, as the client key

`src/services/wallet/nwc-transport.ts` runs the connection on the page's
RelayHub (`pageRelayHub()` from the bridge's front door) as its own
identity, `nwc:<client pubkey>`, like a DM call's `ephemeral:<callId>`:

- its REQs and EVENTs never share a socket with the session, even when the
  wallet relay is one the user also browses;
- the only signer that socket can ever use for NIP-42 is the NWC client
  key, never the user's;
- it holds no AUTH lease until the wallet relay asks (a CLOSED or an OK
  with `auth-required:`); then it takes a `'wallet'` lease and
  authenticates as the client key, which the relay already sees as the
  author of every request. A relay that only sends a challenge gets no
  answer.

Disconnecting, logging out or switching account removes the identity from
the hub, with its socket and leases.

### Storage: sealed, per account

The link is a spending credential (`src/services/wallet/nwc-storage.ts`):

- sealed with the session vault (`src/lib/crypto/session-vault.ts`,
  AES-GCM under a non-extractable key in IndexedDB) and written as
  `obelisk-dex/nwc:<pubkey>` in localStorage, holding only the sealed box;
- under its own vault key, `wallet-key`, not the session's (which every
  login rotates and every logout destroys); each new connection rotates
  the wallet key;
- bound to `nwc:<pubkey>` as the AAD, so a box copied under another account
  does not open (and is erased);
- never written in the clear, never logged, sent nowhere but the wallet
  relay (inside signed, encrypted requests; the secret itself never leaves
  the page);
- deleted on Disconnect (record and wallet key) and on logout, including a
  login as another account over this one (`src/services/common/reset.ts` erases
  every record even on a page that never loaded the wallet module);
- only one account is logged in per browser, so when an account loads, any
  other account's record is erased as left over.

`useNwcWalletStore` (`src/store/wallet/nwc-wallet.ts`) holds what the UI may know:
wallet key, relays, name, budget, whether it is stored. The secret stays in
`nwc-wallet.ts`'s memory. Every entry point takes the account, and a wallet
pays only for the account that connected it (`nwcPayerFor`).

Without IndexedDB (some private modes, storage disabled) the wallet still
connects, for this visit only, and Settings says it will be forgotten on
close or reload: the same rule as an nsec login.

## Zaps

`src/services/wallet/send-zap.ts`, driven by `useSendZap`
(`src/hooks/chat/zaps/useSendZap.ts`) from `MessageZapModal` (its form,
`MessageZapDialog`, reads `useMessageZapForm`):

1. `checkZap` refuses before anything leaves the browser: no Lightning
   address, no wallet, no amount, no signer.
2. `sendZap` connects the wallet, asks the recipient's LNURL endpoint for a
   NIP-57 zap invoice (`requestZapInvoice`), pays it, then posts a kind 7 ⚡
   reaction carrying the invoice so the channel sees it.
3. Once the payment has gone through the result is always a success. A
   marker that could not be posted comes back as `markerError`, so the modal
   never offers a retry that would pay twice.
4. `useSendZap` holds the send from the first click (a second press in the
   same tick is ignored) and, once the zap is paid, never shows an error or
   re-enables Zap, even if the confirmation toast fails.
5. When an NWC wallet went silent after the request was sent
   (`mayHavePaid`), the modal says the zap was not confirmed and to check
   the wallet, and Zap stays disabled until the modal is closed: a retry
   would ask for a fresh invoice and could pay twice. A wallet error that
   moved no money (`not-paid`) re-enables Zap as before.

Receipts (kind 9735) are checked with the SDK's `validateZapReceipt` in
`useMessageZaps`.

## Invoices in chat

`InvoiceCard` (`src/components/chat/`) renders a posted invoice; its state is
`useInvoiceCard` (`src/hooks/chat/`), and the payment is
`src/services/wallet/pay-invoice.ts`.

- **Pay** checks what it can without the wallet (already paid, being paid,
  no amount, expired, no wallet). A refusal is shown in words; otherwise the
  card asks for one **Confirm** click showing the amount, the description
  and which wallet will pay.
- **Confirm** calls `payInvoice`, which claims the invoice in
  `src/store/wallet/invoice-payments.ts` (keyed by payment hash) before the first
  `await`. A second click, a re-render, or a second card for the same
  invoice finds it claimed. Over NWC this means one `pay_invoice` request.
- If the wallet fails, the claim is given back and the card shows the
  error through `errorText` with the fallback `chat.invoice.payFailed`.
  That includes an NWC timeout, whose message says to check the wallet
  first: a Lightning invoice settles once, so paying it again fails at the
  wallet rather than paying twice.
- Once the wallet reports the payment done, the invoice is marked paid
  before any other code runs. Nothing that fails later (the confirmation
  toast, say) can make it payable again.

The record is this tab's memory only, and it forgets who paid on logout. A
payment still in flight keeps its claim. After a reload a paid invoice shows
Pay again; a Lightning invoice settles once, so the wallet then fails rather
than paying twice. Other members do not see that it was paid: that needs an
"invoice paid" event published to the channel, which nothing sends yet.

## Tests

A fake wallet service on fake relays (`tests/support/fake-nwc-wallet.ts`,
on the hub's `FakeRelayFactory`; the test setup bans real sockets and
fetches): `tests/lib/nwc/` (URI, kinds, client), and under
`tests/services/wallet/`: `nwc-wallet` (connect, sealed storage scan,
reload, disconnect, logout, account isolation, no IndexedDB), `nwc-relay`
(the hub owns the socket under `nwc:<key>`, no AUTH unless demanded, AUTH
only as the client key), `nwc-payments` (NWC over WebLN, invoices and zaps
over NWC, translated wallet errors, timeouts, one `pay_invoice` for two
Confirms). UI: `WalletSettings`, `PayingWalletNote`, `InvoiceCard`,
`useSendZap`.

## Troubleshooting

| What the user sees | Why |
|---|---|
| "No Lightning wallet to pay with ..." | No connected wallet and no WebLN extension (or it was installed after the page loaded: reload). |
| "That is not a Nostr Wallet Connect link." | The pasted text is not a `nostr+walletconnect://` link with a relay and a secret. |
| "Could not reach that wallet on its relay." | The wallet's info event is not on its relay: the wallet is offline, or the link is old. |
| "That connection is not allowed to pay invoices." | The wallet created a read-only connection. Create one with payment permission. |
| "Your wallet did not answer in time ..." | The request was sent and no answer came: check the wallet before paying again. |
| No zap button on a message | The author has no Lightning address (`lud16`). |
| "No amount set" on an invoice | The invoice leaves the amount to the payer; this path cannot pay those. |
| "The payment did not go through." | The wallet refused or failed for a reason it did not name. Nothing was recorded as paid; Pay works again. |

## Roadmap

Paying invoices with no amount over NWC, balance and history, emoji zaps,
per-server zap emojis, sat leaderboards and zap splits are tracked in
[ROADMAP.md](../../ROADMAP.md#fase-6---lightning-zaps-remaining).
