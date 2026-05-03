#!/usr/bin/env node
// Obelisk price bot — publishes kind:0 metadata with current BTC price as name.
// Runs as a plain Nostr client against wss://relay.obelisk.ar. No backend.
//
// Enable by setting BOT_NSEC in .env.local (nsec1... or 64-char hex). Optional:
//   BOT_GROUP_ID    — NIP-29 group id; bot publishes kind 9021 join-request once
//   BOT_INTERVAL_MS — price refresh interval (default 120000 = 2 min)
//   BOT_DISPLAY     — display name template, "{price}" interpolated (default "BTC ${price}")

import { SimplePool, finalizeEvent, getPublicKey, nip19 } from 'nostr-tools';
import { useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket);

const RELAY = 'wss://relay.obelisk.ar';
const INTERVAL = Number(process.env.BOT_INTERVAL_MS) || 120_000;
const TEMPLATE = process.env.BOT_DISPLAY || 'BTC ${price}';
const GROUP_ID = process.env.BOT_GROUP_ID || null;

function parseSecret(input) {
  const v = input.trim();
  if (v.startsWith('nsec1')) {
    const { type, data } = nip19.decode(v);
    if (type !== 'nsec') throw new Error('BOT_NSEC: not an nsec');
    return data; // Uint8Array
  }
  if (/^[0-9a-f]{64}$/i.test(v)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(v.slice(i * 2, i * 2 + 2), 16);
    return bytes;
  }
  throw new Error('BOT_NSEC must be nsec1... or 64-char hex');
}

async function fetchBtcStats() {
  const url = 'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`coingecko ${r.status}`);
  const j = await r.json();
  const m = j.market_data;
  return {
    price: Math.round(m.current_price.usd),
    high24: Math.round(m.high_24h.usd),
    low24: Math.round(m.low_24h.usd),
    change24Pct: m.price_change_percentage_24h,
    ath: Math.round(m.ath.usd),
    athChangePct: m.ath_change_percentage.usd, // negative = below ATH
  };
}

const fmt = (n) => n.toLocaleString('en-US');
const pct = (n) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

async function main() {
  if (!process.env.BOT_NSEC) {
    console.log('[price-bot] BOT_NSEC not set — bot disabled.');
    return;
  }
  const sk = parseSecret(process.env.BOT_NSEC);
  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);
  console.log(`[price-bot] starting on ${RELAY}`);
  console.log(`[price-bot] pubkey (hex): ${pk}`);
  console.log(`[price-bot] pubkey (npub): ${npub}`);
  console.log('[price-bot] ^ whitelist this npub on the relay / add to your group');

  const pool = new SimplePool();

  if (GROUP_ID) {
    const join = finalizeEvent({
      kind: 9021,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['h', GROUP_ID]],
      content: 'price bot join',
    }, sk);
    try {
      await Promise.any(pool.publish([RELAY], join));
      console.log(`[price-bot] sent join-request for group ${GROUP_ID}`);
    } catch (err) {
      console.warn('[price-bot] join-request failed:', err?.message || err);
    }

    // Kind 9 hello — relays drop this until an admin issues 9000 add-user for the bot.
    const hello = finalizeEvent({
      kind: 9,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['h', GROUP_ID]],
      content: '⚡ price bot online — posting BTC stats as kind:0 metadata. Add me with kind 9000 to make me show up in the member list.',
    }, sk);
    try {
      await Promise.any(pool.publish([RELAY], hello));
      console.log(`[price-bot] sent hello message to group ${GROUP_ID}`);
    } catch (err) {
      console.warn('[price-bot] hello message failed (likely not yet admitted):', err?.message || err);
    }
  }

  let lastPrice = null;
  const tick = async () => {
    try {
      const s = await fetchBtcStats();
      if (s.price === lastPrice) return;
      lastPrice = s.price;
      const name = TEMPLATE.replace('${price}', fmt(s.price));
      const about = [
        `BTC/USD: $${fmt(s.price)} (${pct(s.change24Pct)} 24h)`,
        `24h range: $${fmt(s.low24)} – $${fmt(s.high24)}`,
        `ATH: $${fmt(s.ath)} (${pct(s.athChangePct)} from ATH)`,
        `Updated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`,
      ].join('\n');
      const ev = finalizeEvent({
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify({
          name,
          display_name: name,
          about,
          picture: 'https://bitcoin.org/img/icons/opengraph.png',
        }),
      }, sk);
      await Promise.any(pool.publish([RELAY], ev));
      console.log(`[price-bot] published ${name} (${pct(s.change24Pct)} 24h, ${pct(s.athChangePct)} ATH)`);
    } catch (err) {
      console.warn('[price-bot] tick failed:', err?.message || err);
    }
  };

  await tick();
  setInterval(tick, INTERVAL);
}

main().catch((err) => {
  console.error('[price-bot] fatal:', err);
  process.exit(1);
});
