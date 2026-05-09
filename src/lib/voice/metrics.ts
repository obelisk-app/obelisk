/**
 * Observable counters for the mesh voice layer.
 *
 * Every previously-silent failure mode in `VoiceClient` increments a
 * counter here so the Playwright harness (and the in-app `?debug=voice`
 * overlay) can pinpoint regressions without needing source-level prints.
 *
 * `signalsDropped.membershipFinal` is the only counter that should stay
 * at zero on a healthy 2-peer mesh — every other counter has a non-zero
 * baseline (`notForMe` is incremented for every relay-broadcast event
 * not addressed to us, `self` whenever the relay echoes our own beacon
 * back, etc.).
 */
export interface VoiceMetrics {
  beacons: { sent: number; rcvd: number };
  signals: { sent: number; rcvd: number; byeViaControl: number; byeViaRelay: number };
  signalsDropped: {
    wot: number;
    membershipDeferred: number;
    membershipFinal: number;
    deferredOverflow: number;
    notForMe: number;
    self: number;
    unknownPayload: number;
    sfuRouted: number;
  };
  peers: {
    connected: number;
    ever: number;
    tornDown: number;
    tornDownByUnload: number;
    sessionMismatchResets: number;
    iceExhausted: number;
  };
  relay: {
    publishFail: number;
    lastError: string | null;
    authWaited: number;
    authTimedOut: number;
  };
  rateLimit: { hit: number; backoffMs: number };
  controlChannel: {
    opened: number;
    pingSent: number;
    pongRcvd: number;
    lastRttMs: number | null;
  };
  transitive: { discoveredViaRelay: number; discoveredViaControl: number };
}

export function emptyVoiceMetrics(): VoiceMetrics {
  return {
    beacons: { sent: 0, rcvd: 0 },
    signals: { sent: 0, rcvd: 0, byeViaControl: 0, byeViaRelay: 0 },
    signalsDropped: {
      wot: 0,
      membershipDeferred: 0,
      membershipFinal: 0,
      deferredOverflow: 0,
      notForMe: 0,
      self: 0,
      unknownPayload: 0,
      sfuRouted: 0,
    },
    peers: {
      connected: 0,
      ever: 0,
      tornDown: 0,
      tornDownByUnload: 0,
      sessionMismatchResets: 0,
      iceExhausted: 0,
    },
    relay: { publishFail: 0, lastError: null, authWaited: 0, authTimedOut: 0 },
    rateLimit: { hit: 0, backoffMs: 0 },
    controlChannel: { opened: 0, pingSent: 0, pongRcvd: 0, lastRttMs: null },
    transitive: { discoveredViaRelay: 0, discoveredViaControl: 0 },
  };
}
