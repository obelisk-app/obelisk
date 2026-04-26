// server/bootstrap/bot-poller.ts
// Bot poller: refreshes enabled ServerBots on their configured intervals
// and broadcasts `bot-updated` so member lists update live.

import type { ServerContext } from '../context';

export function start(ctx: ServerContext): void {
  void (async () => {
    const { startBotPoller } = await import('../../src/lib/bots/poller');
    startBotPoller(ctx.io);
  })();
}
