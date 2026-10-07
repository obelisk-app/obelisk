/** The e2e selector for a status: lost sockets and offline are one banner, relay access the other. */
export function relayBannerTestId(state: string): 'connection-loss-banner' | 'relay-access-banner' {
  return state === 'disconnected' || state === 'offline' ? 'connection-loss-banner' : 'relay-access-banner';
}
