# Price Bot

`scripts/price-bot.mjs` — publishes BTC market data as the bot's own kind:0
profile metadata, so its display name in any client renders as
`BTC $123,456`. Optional: posts a kind 9 hello to a target group on startup.

## What it does

On a fixed interval (default 2 minutes):

1. Fetches BTC stats from CoinGecko (`current_price`, 24h high/low, 24h
   change, ATH, % from ATH).
2. If the rounded USD price has changed since the last tick, publishes a
   kind:0 metadata event signed by `BOT_NSEC`:
   - `name` / `display_name`: `BTC $<price>` (template configurable)
   - `about`: 4-line summary (price, range, ATH, timestamp)
   - `picture`: bitcoin.org logo

On startup, if `BOT_GROUP_ID` is set:

- Publishes kind 9021 (`group/join-request`) — admin must approve via 9000.
- Publishes a kind 9 chat message announcing itself to the group. Relays
  will drop this until the bot is admitted.

## Configuration

All via `.env.local`:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `BOT_NSEC` | yes | — | `nsec1...` or 64-char hex |
| `BOT_GROUP_ID` | no | unset | NIP-29 group id (the `c=` query param in `https://obelisk.ar/app?c=...`) |
| `BOT_INTERVAL_MS` | no | `120000` | Price refresh interval, ms |
| `BOT_DISPLAY` | no | `BTC ${price}` | Template, `${price}` is interpolated |

Relay is hardcoded to `wss://relay.obelisk.ar` (`RELAY` constant in the
script). Add public relays to the publish list if you want the bot's
profile to resolve on damus/primal/etc.

## Running

Direct (foreground, debugging):

```bash
node --env-file-if-exists=.env.local scripts/price-bot.mjs
```

PM2 (production):

```bash
pm2 start scripts/price-bot.mjs \
  --name obelisk-price-bot \
  --node-args="--env-file-if-exists=/root/obelisk-dex/.env.local"
pm2 save
```

The bot logs its own npub at startup — capture this to whitelist/admit it.

## Admitting the bot to a group

The bot's join-request alone is not enough — a relay enforcing NIP-29 will
drop posts from non-members. As the group admin, publish a kind 9000:

```ts
import { getBridge } from '@/lib/nostr-bridge';
const bridge = await getBridge();
await bridge.addUserToGroup(groupId, botPubkeyHex);    // member
// or, for admin role:
await bridge.addAdminToGroup(groupId, botPubkeyHex, ['ban','timeout']);
```

(Use whatever helpers the bridge exposes today; the underlying event is
`{ kind: 9000, tags: [['h', groupId], ['p', botPubkey, ...roles]] }`.)

After admission the relay will accept the bot's kind 9 / kind 9005
messages, and `relay.obelisk.ar` will start emitting the bot's pubkey in
kind 39002 (members) — at which point the bot shows up in the in-app
member list at `https://obelisk.ar/app?c=<groupId>`.

## Verifying it's working

```bash
pm2 logs obelisk-price-bot --lines 50
```

Expected lines on a healthy bot:

```
[price-bot] starting on wss://relay.obelisk.ar
[price-bot] pubkey (npub): npub1...
[price-bot] sent join-request for group <id>
[price-bot] sent hello message to group <id>
[price-bot] published BTC $123,456 (+1.23% 24h, -8.45% ATH)
```

If you see `All promises were rejected` on every publish, the relay is
rejecting the events — see [README § Failure modes](./README.md#failure-modes).

## Stopping / rotating

```bash
pm2 stop obelisk-price-bot
pm2 delete obelisk-price-bot
pm2 save
```

To rotate the nsec: stop the bot, generate a fresh nsec, update
`.env.local`, restart, then issue a new kind 9000 add-user with the new
pubkey (and optionally kind 9001 remove-user with the old one).
