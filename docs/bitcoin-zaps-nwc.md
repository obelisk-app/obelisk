# Bitcoin zaps and invoices

Obelisk pays Lightning from chat in two places: a **zap** on a message or a
person, and the **Pay** button on a BOLT11 invoice someone posted in a
channel. Both pay through the same wallet path, and there is no other.

(The file name is historical. An earlier design kept an encrypted Nostr
Wallet Connect string on a server; that server and the code behind it are
gone.)

## The wallet path

`src/services/wallet/wallet.ts` is the one module that talks to a wallet:

- `isWalletAvailable()`: is there a wallet to ask, without asking it.
- `connectWallet()`: asks the wallet for permission and returns a
  connection with `pay(invoice)`, or `null` when there is no wallet.

The wallet is a **WebLN** browser extension (Alby and similar), which puts a
provider on `window.webln`. The app has no screen to paste a Nostr Wallet
Connect (NIP-47) string and nowhere to keep one, so the SDK's `NwcClient`
(`@nostr-wot/wallet`) has no caller. Someone whose wallet speaks NWC links
it to an extension such as Alby, and pays through that. If the app ever
stores an NWC connection, it plugs in behind `connectWallet` and both flows
get it.

WebLN's `sendPayment` takes only the invoice. An invoice that sets no amount
therefore cannot be paid here; the card says so instead of offering Pay.

## Zaps

`src/services/wallet/send-zap.ts`, driven by `useSendZap`
(`src/hooks/chat/useSendZap.ts`) from `MessageZapModal`:

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

Receipts (kind 9735) are checked with the SDK's `validateZapReceipt` in
`useMessageZaps`.

## Invoices in chat

`InvoiceCard` (`src/components/chat/`) renders a posted invoice; its state is
`useInvoiceCard` (`src/hooks/chat/`), and the payment is
`src/services/wallet/pay-invoice.ts`.

- **Pay** checks what it can without the wallet (already paid, being paid,
  no amount, expired, no wallet). A refusal is shown in words; otherwise the
  card asks for one **Confirm** click showing the amount and description.
- **Confirm** calls `payInvoice`, which claims the invoice in
  `src/store/invoice-payments.ts` (keyed by payment hash) before the first
  `await`. A second click, a re-render, or a second card for the same
  invoice finds it claimed.
- If the wallet fails, the claim is given back and the card shows the
  error through `errorText` with the fallback `chat.invoice.payFailed`.
- Once the wallet reports the payment done, the invoice is marked paid
  before any other code runs. Nothing that fails later (the confirmation
  toast, say) can make it payable again.

The record is this tab's memory only, and it forgets who paid on logout. A
payment still in flight keeps its claim. After a reload a paid invoice shows
Pay again; a Lightning invoice settles once, so the wallet then fails rather
than paying twice. Other members do not see that it was paid: that needs an
"invoice paid" event published to the channel, which nothing sends yet.

## Troubleshooting

| What the user sees | Why |
|---|---|
| "No Lightning wallet found in this browser" | No WebLN extension, or it was installed after the page loaded (reload). |
| No zap button on a message | The author has no Lightning address (`lud16`). |
| "No amount set" on an invoice | The invoice leaves the amount to the payer; WebLN cannot pay those. |
| "The payment did not go through." | The wallet refused or failed (no route, budget, user said no). Nothing was recorded as paid; Pay works again. |

## Roadmap

Emoji zaps, per-server zap emojis, sat leaderboards and zap splits are
tracked in [ROADMAP.md](../ROADMAP.md#fase-6--lightning-network-zaps).
