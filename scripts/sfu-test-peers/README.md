# SFU test peers

Synthetic Nostr clients used to smoke-test the Obelisk SFU end-to-end without
needing two real browsers. The SFU server itself lives in a separate repo:
**[obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu)**.

| Script              | Engine    | What it does                                                                                  |
|---------------------|-----------|-----------------------------------------------------------------------------------------------|
| `test-peer-ms.mjs`  | mediasoup | Publishes kind 25052 `start`, then drives a `PlainTransport` via `POST /test/inject` + ffmpeg |
| `test-peer.mjs`     | werift    | Legacy: full mesh-style SDP/ICE over kind 25050. Use only against the werift engine.          |
| `test-peer-mesh.mjs`| mesh P2P  | Joins the mesh as a regular peer (no SFU). Useful for mesh-only smoke tests.                  |
| `start-call.mjs`    | n/a       | Authors a kind 25052 `start` once and exits — handy for poking the SFU manually.              |

Each script keeps a persistent keypair under `scripts/.test-peer*/identity.json`
so the dex remembers the bot between restarts.

## Run

```bash
# mediasoup peer (current default SFU engine)
node scripts/sfu-test-peers/test-peer-ms.mjs <channel-id-hex>
```

Required env when the SFU's kind 31313 advertisement isn't reachable
(e.g. NIP-29-only relays don't store it):

```bash
SFU_PUBKEY=<sfu hex pubkey> \
SFU_URL=https://sfu.obelisk.ar \
TEST_PEER_RELAYS=wss://relay.obelisk.ar \
node scripts/sfu-test-peers/test-peer-ms.mjs <channel-id>
```

The peer's pubkey must be whitelisted on `relay.obelisk.ar` (or whichever
trusted-author relay the SFU is configured to read from), otherwise the
relay rejects the `start` event and the SFU never spins up the room.

## Wire protocol

See the obelisk-sfu repo for the full kind 25050 RPC envelope spec, kind
25052 control events, and kind 31313 advertisement schema.
