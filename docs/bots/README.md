# Obelisk Bots

Obelisk has no backend — bots are plain Nostr clients that hold an nsec, talk
directly to `wss://relay.obelisk.ar`, and publish events. They are processes,
not platform features. Each bot is a single Node script under `scripts/` and a
PM2 entry that keeps it running.

## Bot taxonomy

| Type | Identity | Privileges needed | Examples |
|---|---|---|---|
| **Profile bot** | own nsec | none — publishes own kind:0 | [price-bot](./price-bot.md) (BTC ticker as display name) |
| **Group member bot** | own nsec | admitted to group via kind 9000 | [price-bot](./price-bot.md) when posting kind 9 / showing in member list |
| **Admin bot** | nsec with admin role in target group | listed in kind 39001 (admins) | [admin-bot](./admin-bot.md) (auto-moderation, welcome flow, role assignment) |
| **Relay-operator bot** | nsec whitelisted by relay | relay-side allow-list / write permission | any bot that publishes to a closed relay |

A single bot can wear multiple hats. Price bot is a profile bot first; once an
admin adds it to a group it's also a member bot. An admin bot is a member bot
with the admin role attached on top.

## Stack & conventions

- **Language**: Node ESM, no TypeScript build step. Plain `.mjs` under `scripts/`.
- **Nostr lib**: `nostr-tools` (`SimplePool`, `finalizeEvent`, `nip19`,
  `getPublicKey`). Bots do **not** use NDK or the in-app bridge.
- **WebSocket**: `useWebSocketImplementation(WebSocket)` from `nostr-tools/pool`
  with the `ws` package — Node has no native `WebSocket`.
- **Identity**: bots own their nsec. Never reuse a human's nsec for a bot.
- **Secrets**: live in `.env.local` (gitignored). PM2 reads them via Node's
  `--env-file-if-exists` flag, set as `node_args` in the PM2 entry.
- **Supervisor**: PM2. Each bot is its own PM2 process so it can be restarted,
  logged, and monitored independently of the Next.js app.
- **Relay**: `wss://relay.obelisk.ar` for all group/chat events. Public relays
  (damus, nostr.band, primal) are appropriate when you specifically want the
  bot's profile to be globally discoverable.

## File layout

```
scripts/
├── price-bot.mjs         # BTC ticker bot
└── <your-bot>.mjs        # one file per bot

docs/bots/
├── README.md             # this file — taxonomy, lifecycle, conventions
├── price-bot.md          # operational guide for the price bot
└── admin-bot.md          # design pattern for admin/moderation bots

.env.local                # secrets (gitignored): BOT_NSEC, BOT_GROUP_ID, ...
```

## Lifecycle: spinning up a new bot

1. **Generate an nsec.** One-liner:
   ```bash
   node -e "const{generateSecretKey,getPublicKey,nip19}=require('nostr-tools');\
   const sk=generateSecretKey();const pk=getPublicKey(sk);\
   console.log('NSEC='+nip19.nsecEncode(sk));console.log('NPUB='+nip19.npubEncode(pk));"
   ```
   Save the npub — you'll need it to whitelist / admit the bot.

2. **Write secrets to `.env.local`.** Use a unique env var per bot
   (`PRICE_BOT_NSEC`, `WELCOME_BOT_NSEC`) so they can run side-by-side. If you
   only have one bot, the existing `BOT_NSEC` is fine.

3. **Whitelist the npub on the relay** if `relay.obelisk.ar` enforces an
   allow-list (it currently does — unsigned/unauth posts are rejected).

4. **Add the bot to the target group** as the group admin:
   - Member-only access → publish kind 9000 with `['p', botPubkey, ...]` and
     `['h', groupId]`.
   - Admin role → publish kind 9000 with `['p', botPubkey, 'admin', ...roles]`.
   - Until this happens the bot's kind 9 / kind 9005 events will be silently
     dropped by NIP-29 relays.

5. **Register with PM2:**
   ```bash
   pm2 start scripts/<your-bot>.mjs \
     --name obelisk-<your-bot> \
     --node-args="--env-file-if-exists=/root/obelisk-dex/.env.local"
   pm2 save
   ```

6. **Verify** with `pm2 logs obelisk-<your-bot>`. The bot logs its own npub at
   startup — sanity-check it matches what you whitelisted/admitted.

## Failure modes

- **`All promises were rejected`** on every publish: the relay rejected the
  event. Almost always one of (a) bot not whitelisted on the relay, (b) bot
  not yet admitted to the group, (c) NIP-42 AUTH required and the bot doesn't
  implement it. The price bot script does not currently handle AUTH — if your
  relay needs it, the bot script must be extended (see
  `src/lib/nostr-bridge/client.ts` for reference).
- **`coingecko 429`** in price bot: rate-limited. Increase `BOT_INTERVAL_MS`.
- **Bot keeps publishing duplicate events**: the price bot dedupes via
  `lastPrice`. If you fork it, keep that pattern — relays accept duplicates
  but clients render churn.
- **Bot's profile not discoverable globally**: kind:0 published only to
  `relay.obelisk.ar`. Add public relays to the publish list if external
  visibility matters.

## Security notes

- Bot nsecs are functionally root for that identity. Treat `.env.local` like
  a credential store: file mode 600, never committed, never logged.
- An admin bot can ban members, rename the group, change images. Scope its
  capabilities by the events it actually emits — don't grant admin role
  unless the bot needs kind 9000–9007 powers.
- Bots run server-side and can see plaintext `BOT_NSEC`. Anyone with shell
  access to this host can impersonate them. Rotate the nsec if you suspect
  compromise (and re-issue the kind 9000 add-user with the new pubkey).
