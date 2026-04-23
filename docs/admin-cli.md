# Admin CLI for AI coding agents

`scripts/admin-cli/` is a headless driver for Obelisk's `/admin` panel. It speaks to the same HTTP API the browser uses — authenticated via Nostr (nsec or NIP-46 bunker) — so every action passes through the same role checks as the web UI. The CLI has **no extra privileges**: what it can do is decided entirely by the role of the pubkey you log in with.

This design makes it ideal for any CLI coding agent (Claude Code, Codex, Cursor, Aider…): give the agent its own nsec, grant that nsec an admin role on the server, and the agent can now manage channels, roles, members, bans, bots, and emojis end-to-end.

> **The CLI talks HTTP, not DB.** You can point it at your local dev server, a Cloudflare tunnel, or a production domain — no server-side changes required.

## Quick start

```bash
# 1. Generate or reuse an nsec for the agent
#    (save it outside the repo — e.g. ~/.config/obelisk-cli/agent.nsec, chmod 0600)

# 2. Log in (session cookie persists at ~/.config/obelisk-cli/session.json)
OBELISK_NSEC=$(cat ~/.config/obelisk-cli/agent.nsec) \
  npm run admin -- login --url https://your-obelisk.example.com

# 3. Promote the pubkey to admin on the target server (owner does this once, from web UI or their own CLI)
npm run admin -- members role <serverId> <agentPubkey> --role admin

# 4. Drive it
npm run admin -- servers list
npm run admin -- channels list <serverId>
npm run admin -- channels create <serverId> --payload '{"name":"announcements","type":"text"}'
```

Full command list: `npm run admin -- help`, or see `scripts/admin-cli/README.md` for reference.

## Auth modes

| Mode | Key custody | When to use |
|------|-------------|-------------|
| `--nsec` / `OBELISK_NSEC` | Plain nsec on the host running the CLI | Dev / sandboxed agents |
| `--bunker bunker://…` (NIP-46) | Key stays in your signer app; CLI only asks it to sign challenges | Production, untrusted hosts |

The target URL is resolved as `--url` → `OBELISK_URL` → `http://localhost:3000` and persisted in the session file on login.

## Giving an agent its own account

1. Pick a pubkey. Recommended: a dedicated nsec per deployment (don't share your personal key with the agent).
2. Log that pubkey in from the CLI once — this creates a Member row on the server the first time it hits an endpoint.
3. From the web UI (or from a CLI session owned by the server owner): promote the pubkey to `admin`.
4. Store the nsec where only the agent can read it (e.g. `~/.config/obelisk-cli/<agent>.nsec`, `chmod 0600`).

For Obelisk's in-house admin bot ("Archon"), the nsec lives at `~/.config/obelisk-cli/archon.nsec` and is loaded via `OBELISK_NSEC=$(cat …)`.

## What an admin CLI session can do

Passing `requireRole('admin')` checks:

- `channels`, `categories`, `roles`, `members` (kick / ban / unban), `emojis`, `gifs`, `messages delete`
- `bots` configuration and system messages
- `server edit` for operational fields: `banner`, `welcomeChannelId`, `welcomeLocale`, `landingChannelId`

Owner-only (CLI gets 403 if the agent isn't the server owner):

- `name`, `icon`, upload limits, allowed MIME types
- `members role` (promote / demote), `join-mode`, `server delete`

Instance-owner only:

- `ownerPubkey` transfers, `instance` settings, instance-wide user bans.

The full role matrix lives in `scripts/admin-cli/README.md` and `src/lib/auth-roles.ts`.

### Appearing online

`npm run admin -- presence [--server <id>]...` opens a Socket.io connection using the saved session cookie and holds it open until Ctrl-C. Other clients see the identity as online for the lifetime of the process (same presence channel the web UI uses). Agents should start this at the beginning of a moderation session and leave it running in a dedicated terminal. See `scripts/admin-cli/AGENT.md` → "Appearing online during a session".

## Using it from a coding agent

`scripts/admin-cli/AGENT.md` is the terse cheat sheet designed to be pulled into an agent's context. Typical agent loop:

1. Agent reads `scripts/admin-cli/AGENT.md` to learn the command surface.
2. Agent runs `npm run admin -- whoami` to confirm the session.
3. Agent takes action via `channels`, `roles`, `members`, etc., or the `exec` escape hatch for any endpoint not yet wrapped:

   ```bash
   npm run admin -- exec GET  /api/admin/emojis?serverId=abc
   npm run admin -- exec POST /api/admin/emojis?serverId=abc --body '{"name":"obelisk","url":"…"}'
   ```

4. All failures are surfaced as plain HTTP status codes + JSON bodies — easy for the agent to reason about and recover from.

## Security notes

- **One nsec per agent per environment.** Don't reuse a prod nsec on a dev box.
- **Prefer bunkers in production.** `--bunker` keeps the key off the CLI host entirely.
- **Least privilege.** Start the agent as `member` or `mod` and only promote to `admin` for tasks that need it. `owner` should almost never be an agent.
- **Session file is `chmod 0600`.** Don't commit it, don't copy it between hosts.
- **Audit log.** Every privileged action goes through the same moderation/audit pipeline as web-UI actions, so agent activity is visible to human admins.

## Related

- `scripts/admin-cli/README.md` — full command reference
- `scripts/admin-cli/AGENT.md` — agent-oriented cheat sheet
- `src/lib/auth-roles.ts` — authoritative role hierarchy
- [ROADMAP.md](../ROADMAP.md#fase-4--polish--launch) — where the CLI lives in the plan
