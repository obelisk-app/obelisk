/**
 * Shared ICE-server configuration for the mesh and SFU engines.
 *
 * STUN-only configurations work on permissive NATs but fail on symmetric /
 * carrier-grade NATs. Set `NEXT_PUBLIC_TURN_URLS` (comma-separated) for a
 * TURN fallback; provide `NEXT_PUBLIC_TURN_USERNAME` and
 * `NEXT_PUBLIC_TURN_CREDENTIAL` if the TURN needs auth. Use
 * `NEXT_PUBLIC_FORCE_RELAY=1` to force `iceTransportPolicy: 'relay'` for
 * connectivity debugging — read separately by the mesh `Peer` since the
 * SFU client doesn't expose that option.
 */
export function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (turnUrls.length > 0) {
    const username = process.env.NEXT_PUBLIC_TURN_USERNAME;
    const credential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
    servers.push({
      urls: turnUrls,
      ...(username ? { username } : {}),
      ...(credential ? { credential } : {}),
    });
  }
  return servers;
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers();

export const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  process.env.NEXT_PUBLIC_FORCE_RELAY === '1' ? 'relay' : 'all';
