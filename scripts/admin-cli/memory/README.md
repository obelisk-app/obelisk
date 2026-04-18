# Admin CLI — Server Memory

Per-server state the CLI caches locally. **Nothing in this directory is committed** — `.gitignore` here excludes everything except itself and this README.

Files are written as `<serverId>.json` (one per server) by commands like:

- `npm run admin -- servers sync <serverId>` — refresh channel/category/role config
- `npm run admin -- servers scan <serverId>` — fetch recent messages per channel, incremental
- `npm run admin -- servers memory <serverId>` — dump the cached JSON

## Shape

```jsonc
{
  "serverId": "srv_...",
  "server": { "id": "...", "name": "...", "banner": "...", ... },
  "categories": [{ "id": "...", "name": "...", "position": 0 }],
  "channels": [
    {
      "id": "ch_...",
      "name": "general",
      "description": "Casual conversation",
      "type": "text",
      "categoryId": "cat_...",
      "writePermission": null,
      "readPermission": null,
      "lastScannedAt": "2026-04-18T...",
      "lastScannedMessageId": "msg_...",
      "recentMessages": [
        { "id": "msg_...", "authorPubkey": "...", "content": "...", "createdAt": "..." }
      ]
    }
  ],
  "syncedAt": "2026-04-18T...",
  "scannedAt": "2026-04-18T..."
}
```

## Why local

- Contains message content and pubkeys — treat as sensitive.
- Per-machine cache; safe to delete at any time (`rm memory/*.json`).
- Multiple machines / CI runners will each have their own view.

## Safety

- Directory permissions follow the session file (`0600`).
- To fully wipe: `rm -f scripts/admin-cli/memory/*.json`.
