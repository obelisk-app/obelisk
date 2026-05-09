'use client';

import { useEffect, useState } from 'react';
import type { VoiceMetrics } from '@/lib/voice/metrics';
import type { VoiceDebugEvent } from '@/lib/voice/debug';

const REFRESH_MS = 500;
const SHOW_EVENTS = 50;

interface DebugBag {
  events: VoiceDebugEvent[];
  metrics: VoiceMetrics | null;
}

function readBag(): DebugBag | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __obeliskVoiceDebug?: DebugBag }).__obeliskVoiceDebug ?? null;
}

/**
 * Floating diagnostic panel for the mesh voice layer. Mounted by
 * `VoiceRoom` only when the URL carries `?debug=voice`. Reads the
 * window-mounted metrics + ring buffer maintained by `VoiceClient`,
 * polls every 500 ms (cheap — no React state for the metrics object,
 * only a render tick).
 *
 * Displays:
 *  - top counters: connected peers, relay/control bye split, RTT
 *  - dropped-signal counters (the ones that should stay near zero on
 *    a healthy mesh — wot, membershipFinal, deferredOverflow)
 *  - relay state: publish failures + last error string
 *  - rate-limit total + cumulative backoff
 *  - last 50 events from the ring buffer
 *
 * Not styled with the La Crypta tokens — overlay is fixed-position with
 * a high z-index and a dim background; it's a developer surface, not
 * end-user UI.
 */
export function DebugOverlay() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  const bag = readBag();
  const metrics = bag?.metrics;
  const events = bag?.events.slice(-SHOW_EVENTS).reverse() ?? [];

  return (
    <div
      data-testid="voice-debug-overlay"
      data-tick={tick}
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        width: 360,
        maxHeight: '80vh',
        overflow: 'auto',
        background: 'rgba(0,0,0,0.85)',
        color: '#b4f953',
        padding: '8px 12px',
        font: '11px ui-monospace, SFMono-Regular, monospace',
        border: '1px solid #262626',
        borderRadius: 8,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>voice debug</div>
      {!metrics && <div style={{ color: '#a3a3a3' }}>no VoiceClient mounted</div>}
      {metrics && (
        <>
          <Section title="peers">
            <Row k="connected" v={metrics.peers.connected} />
            <Row k="ever" v={metrics.peers.ever} />
            <Row k="tornDown" v={metrics.peers.tornDown} />
            <Row k="byUnload" v={metrics.peers.tornDownByUnload} />
            <Row k="iceExhausted" v={metrics.peers.iceExhausted} />
          </Section>
          <Section title="control channel">
            <Row k="opened" v={metrics.controlChannel.opened} />
            <Row k="ping" v={`${metrics.controlChannel.pingSent}/${metrics.controlChannel.pongRcvd}`} />
            <Row k="lastRtt" v={metrics.controlChannel.lastRttMs ?? '—'} />
          </Section>
          <Section title="discovery">
            <Row k="viaRelay" v={metrics.transitive.discoveredViaRelay} />
            <Row k="viaControl" v={metrics.transitive.discoveredViaControl} />
          </Section>
          <Section title="signals">
            <Row k="sent/rcvd" v={`${metrics.signals.sent}/${metrics.signals.rcvd}`} />
            <Row k="bye-control" v={metrics.signals.byeViaControl} />
            <Row k="bye-relay" v={metrics.signals.byeViaRelay} />
          </Section>
          <Section title="dropped">
            <Row k="wot" v={metrics.signalsDropped.wot} highlight={metrics.signalsDropped.wot > 0} />
            <Row k="membFinal" v={metrics.signalsDropped.membershipFinal} highlight={metrics.signalsDropped.membershipFinal > 0} />
            <Row k="membDefer" v={metrics.signalsDropped.membershipDeferred} />
            <Row k="overflow" v={metrics.signalsDropped.deferredOverflow} highlight={metrics.signalsDropped.deferredOverflow > 0} />
            <Row k="notForMe" v={metrics.signalsDropped.notForMe} />
          </Section>
          <Section title="relay">
            <Row k="beacons s/r" v={`${metrics.beacons.sent}/${metrics.beacons.rcvd}`} />
            <Row k="publishFail" v={metrics.relay.publishFail} highlight={metrics.relay.publishFail > 0} />
            <Row k="auth wait/timeout" v={`${metrics.relay.authWaited}/${metrics.relay.authTimedOut}`} />
            {metrics.relay.lastError && (
              <Row k="lastErr" v={metrics.relay.lastError.slice(0, 40)} highlight />
            )}
          </Section>
          <Section title="rate-limit">
            <Row k="hit" v={metrics.rateLimit.hit} highlight={metrics.rateLimit.hit > 0} />
            <Row k="backoff" v={`${metrics.rateLimit.backoffMs}ms`} />
          </Section>
          <Section title="sfu reliability">
            <Row
              k="retries"
              v={metrics.sfuReliability.consumeRetries}
              highlight={metrics.sfuReliability.consumeRetries > 0}
            />
            <Row
              k="stale"
              v={metrics.sfuReliability.staleConsumer}
              highlight={metrics.sfuReliability.staleConsumer > 0}
            />
            <Row
              k="failed"
              v={metrics.sfuReliability.consumeFailed}
              highlight={metrics.sfuReliability.consumeFailed > 0}
            />
          </Section>
        </>
      )}
      <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>events</div>
      {events.length === 0 && <div style={{ color: '#a3a3a3' }}>—</div>}
      {events.map((ev, i) => (
        <div key={i} style={{ color: ev.kind === 'relay-error' || ev.kind === 'signal-dropped' ? '#ef4444' : '#a3a3a3' }}>
          {new Date(ev.ts).toISOString().slice(11, 23)}{' '}
          <span style={{ color: '#fafafa' }}>{ev.kind}</span>{' '}
          {ev.reason ? <span style={{ color: '#fbbf24' }}>{ev.reason}</span> : null}{' '}
          {ev.peer ? <span style={{ color: '#60a5fa' }}>{ev.peer.slice(0, 8)}</span> : null}{' '}
          {ev.payload != null ? (
            <span style={{ color: '#a3a3a3' }}>
              {typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload).slice(0, 60)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ color: '#fafafa', fontWeight: 500 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: number | string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', color: highlight ? '#ef4444' : '#a3a3a3' }}>
      <span>{k}</span>
      <span>{String(v)}</span>
    </div>
  );
}
