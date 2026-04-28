# Bitcoin Zaps via Nostr Wallet Connect

Obelisk supports sending Bitcoin zaps (Lightning payments) from chat. The wallet link uses [NIP-47 Nostr Wallet Connect (NWC)](https://github.com/nostr-protocol/nips/blob/master/47.md) — your Lightning wallet stays on your phone / node, and Obelisk only holds a scoped remote-control string that it uses to ask the wallet to pay invoices on your behalf.

## What you get

- One wallet connection per Obelisk account, reused across every server you're in.
- Per-user spend budgets and per-wallet limits (enforced by your wallet, not by Obelisk).
- Client-side encryption of the NWC connection string before it reaches the server, so a database leak never yields a usable wallet handle.
- Zap button on any chat message; picker modal (`ZapPickerModal`) with presets (21 / 100 / 500 / 1000 sats) or a custom amount.

## How it works

```
┌──────────────┐      NWC string       ┌─────────────┐     NIP-47 relay     ┌───────────────┐
│  Your wallet │ ────── copy ──────▶  │  Obelisk UI │ ─── sign/pay req ─▶  │  Your wallet  │
│  (Alby, …)   │                       │  (browser)  │ ◀──── receipt ─────  │  signer       │
└──────────────┘                       └─────────────┘                      └───────────────┘
                                              │
                                              │ encrypted blob
                                              ▼
                                      ┌──────────────┐
                                      │  Obelisk DB  │   (never sees plaintext NWC)
                                      └──────────────┘
```

- Encryption helpers: `src/lib/crypto.ts`
- NWC client: `src/lib/nwc.ts`
- Wallet API endpoints: `src/app/api/wallet/`
- Zap state: `src/store/zap.ts`
- UI: `src/components/wallet/`, `src/components/chat/ZapPickerModal.tsx`

## Connecting a wallet

1. Open your Obelisk profile → **Wallet**.
2. In your Lightning wallet (Alby, Mutiny, Zeus, Cashu.me, Coinos, etc.) create a new NWC connection and copy the `nostr+walletconnect://…` string.
3. Paste it into Obelisk and hit **Connect**.
4. The string is encrypted in the browser before being sent to the server. Only your logged-in session can decrypt it.

## Sending a zap

- From any chat message → click the ⚡ button → pick an amount → confirm.
- From a user's profile → **Zap** button.
- The picker is `ZapPickerModal`; presets are configurable in-code.

## Security model

- The NWC string stays encrypted at rest. Obelisk server code can read it only in the context of a logged-in session that can provide the decryption material.
- Your Lightning private keys never touch Obelisk; the wallet signs invoices itself and sends back a receipt.
- Spend limits are enforced by your wallet (set them there — Obelisk does not override them).
- Uninstalling is one-click: revoke the NWC string in your wallet, and any cached copy in Obelisk becomes inert.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| "Connection failed" on paste | NWC relay unreachable; try a wallet-provided relay or `wss://relay.getalby.com/v1`. |
| Zap button missing on a message | Recipient has no Lightning address / NIP-57 support. |
| Payment stuck pending | Wallet budget exhausted — check spend limits in your wallet. |

## Roadmap

Emoji zaps (reaction + sats in one click), per-server configurable zap emojis, sat leaderboards, zap splits, and NIP-57 zap receipts are tracked in [ROADMAP.md](../ROADMAP.md#fase-6--lightning-network-zaps).
