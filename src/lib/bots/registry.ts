// Prebuilt "bot" definitions. Each bot is a per-server pseudo-member whose
// displayed status is refreshed on an interval by the poller. v1 ships two
// bots backed by yadio.io (BTC/USD and sats/ARS); Peronio and Dolar are
// registered but hidden behind `enabledInUi: false` until implemented.

export type BotType = 'btc-usd' | 'sats-ars' | 'peronio-ars' | 'dolar-ars';

export interface BotDef {
  type: BotType;
  defaultName: string;
  defaultAvatar: string;
  intervalMs: number;
  /** If false, the admin UI hides this bot type (not yet shipping in v1). */
  enabledInUi: boolean;
  /** Returns the formatted status string, e.g. "$63,412". Throws on failure. */
  fetchValue: () => Promise<string>;
}

async function fetchJson(url: string, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function fmtArs(n: number, decimals = 2): string {
  return `$${n.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export const BOTS: Record<BotType, BotDef> = {
  'btc-usd': {
    type: 'btc-usd',
    defaultName: 'BTC/USD',
    defaultAvatar: '/bots/btc.svg',
    intervalMs: 60_000,
    enabledInUi: true,
    async fetchValue() {
      // yadio returns { BTC: <price-in-usd>, USD: 1, ... }
      const data = await fetchJson('https://api.yadio.io/exrates/USD');
      const price = Number(data?.BTC);
      if (!Number.isFinite(price) || price <= 0) throw new Error('bad BTC price');
      return `BTC ${fmtUsd(price)}`;
    },
  },
  'sats-ars': {
    type: 'sats-ars',
    defaultName: 'sats/ARS',
    defaultAvatar: '/bots/sats.svg',
    intervalMs: 60_000,
    enabledInUi: true,
    async fetchValue() {
      // yadio returns ARS.BTC = BTC price in ARS; 1 BTC = 100,000,000 sats
      const data = await fetchJson('https://api.yadio.io/exrates/ARS');
      const btcArs = Number(data?.BTC);
      if (!Number.isFinite(btcArs) || btcArs <= 0) throw new Error('bad BTC/ARS price');
      const satsArs = btcArs / 100_000_000;
      return `1 sat = ${fmtArs(satsArs, 2)}`;
    },
  },
  'peronio-ars': {
    type: 'peronio-ars',
    defaultName: 'PE/ARS',
    defaultAvatar: '/bots/peronio.svg',
    intervalMs: 60_000,
    enabledInUi: false,
    async fetchValue() {
      throw new Error('peronio-ars not implemented');
    },
  },
  'dolar-ars': {
    type: 'dolar-ars',
    defaultName: 'USD/ARS',
    defaultAvatar: '/bots/usd.svg',
    intervalMs: 60_000,
    enabledInUi: true,
    async fetchValue() {
      const data = await fetchJson('https://api.yadio.io/exrates/ARS');
      const usdArs = Number(data?.USD);
      if (!Number.isFinite(usdArs) || usdArs <= 0) throw new Error('bad USD/ARS price');
      return `USD ${fmtArs(usdArs, 0)}`;
    },
  },
};

export function isBotType(t: string): t is BotType {
  return t === 'btc-usd' || t === 'sats-ars' || t === 'peronio-ars' || t === 'dolar-ars';
}

export function botDef(type: string): BotDef | null {
  return isBotType(type) ? BOTS[type] : null;
}

/** Synthetic pubkey used to render a bot row in the member list. */
export function botPubkey(botId: string): string {
  return `bot:${botId}`;
}

export function isBotPubkey(pubkey: string): boolean {
  return pubkey.startsWith('bot:');
}
