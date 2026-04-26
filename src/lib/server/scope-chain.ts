// src/lib/server/scope-chain.ts
// Build the most-specific → least-specific scope chain for a notification
// payload. Walked client-side by `lib/notifications/prefs.resolveScope` to
// determine which NotificationPreference row applies (channel overrides
// server-level mute).

export type ScopeRef =
  | { type: 'channel'; id: string }
  | { type: 'server'; id: string }
  | { type: 'dm'; id: string };

export interface ScopeChainInput {
  channelId?: string;
  serverId?: string;
  dmCounterparty?: string;
}

export function buildScopeChain(input: ScopeChainInput): ScopeRef[] {
  const chain: ScopeRef[] = [];
  if (input.dmCounterparty) {
    chain.push({ type: 'dm', id: input.dmCounterparty });
    return chain;
  }
  if (input.channelId) chain.push({ type: 'channel', id: input.channelId });
  if (input.serverId) chain.push({ type: 'server', id: input.serverId });
  return chain;
}
