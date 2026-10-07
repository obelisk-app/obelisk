'use client';

import { useTranslations } from 'next-intl';
import { useDebugOverlay } from '@/hooks/voice/room/useDebugOverlay';
import DebugSection from './DebugSection';
import DebugRow from './DebugRow';

/**
 * Floating diagnostic panel for the mesh voice layer. Mounted by
 * `VoiceRoom` only when the URL carries `?debug=voice`. Reads the
 * window-mounted metrics + ring buffer maintained by `VoiceClient`,
 * polls every 500 ms (cheap - no React state for the metrics object,
 * only a render tick).
 *
 * Displays:
 *  - top counters: connected peers, relay/control bye split, RTT
 *  - dropped-signal counters (the ones that should stay near zero on
 *    a healthy mesh - wot, membershipFinal, deferredOverflow)
 *  - relay state: publish failures + last error string
 *  - rate-limit total + cumulative backoff
 *  - last 50 events from the ring buffer
 *
 * Not styled with the La Crypta tokens - overlay is fixed-position with
 * a high z-index and a dim background; it's a developer surface, not
 * end-user UI.
 */
export function DebugOverlay() {
  const t = useTranslations();
  const { tick, metrics, events } = useDebugOverlay();

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
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('voice.voiceDebug.title')}</div>
      {!metrics && <div style={{ color: '#a3a3a3' }}>{t('voice.voiceDebug.noClient')}</div>}
      {metrics && (
        <>
          <DebugSection title={t('voice.voiceDebug.peers')}>
            <DebugRow k="connected" v={metrics.peers.connected} />
            <DebugRow k="ever" v={metrics.peers.ever} />
            <DebugRow k="tornDown" v={metrics.peers.tornDown} />
            <DebugRow k="byUnload" v={metrics.peers.tornDownByUnload} />
            <DebugRow k="iceExhausted" v={metrics.peers.iceExhausted} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.controlChannel')}>
            <DebugRow k="opened" v={metrics.controlChannel.opened} />
            <DebugRow k="ping" v={`${metrics.controlChannel.pingSent}/${metrics.controlChannel.pongRcvd}`} />
            <DebugRow k="lastRtt" v={metrics.controlChannel.lastRttMs ?? '-'} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.discovery')}>
            <DebugRow k="viaRelay" v={metrics.transitive.discoveredViaRelay} />
            <DebugRow k="viaControl" v={metrics.transitive.discoveredViaControl} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.signals')}>
            <DebugRow k="sent/rcvd" v={`${metrics.signals.sent}/${metrics.signals.rcvd}`} />
            <DebugRow k="bye-control" v={metrics.signals.byeViaControl} />
            <DebugRow k="bye-relay" v={metrics.signals.byeViaRelay} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.dropped')}>
            <DebugRow k="wot" v={metrics.signalsDropped.wot} highlight={metrics.signalsDropped.wot > 0} />
            <DebugRow k="membFinal" v={metrics.signalsDropped.membershipFinal} highlight={metrics.signalsDropped.membershipFinal > 0} />
            <DebugRow k="membDefer" v={metrics.signalsDropped.membershipDeferred} />
            <DebugRow k="overflow" v={metrics.signalsDropped.deferredOverflow} highlight={metrics.signalsDropped.deferredOverflow > 0} />
            <DebugRow k="notForMe" v={metrics.signalsDropped.notForMe} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.relay')}>
            <DebugRow k="beacons s/r" /* i18n-exempt: metric name, developer-only ?debug=voice overlay */ v={`${metrics.beacons.sent}/${metrics.beacons.rcvd}`} />
            <DebugRow k="publishFail" v={metrics.relay.publishFail} highlight={metrics.relay.publishFail > 0} />
            <DebugRow k="auth wait/timeout" /* i18n-exempt: metric name, developer-only ?debug=voice overlay */ v={`${metrics.relay.authWaited}/${metrics.relay.authTimedOut}`} />
            {metrics.relay.lastError && (
              <DebugRow k="lastErr" v={metrics.relay.lastError.slice(0, 40)} highlight />
            )}
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.rateLimit')}>
            <DebugRow k="hit" v={metrics.rateLimit.hit} highlight={metrics.rateLimit.hit > 0} />
            <DebugRow k="backoff" v={`${metrics.rateLimit.backoffMs}ms`} />
          </DebugSection>
          <DebugSection title={t('voice.voiceDebug.sfuReliability')}>
            <DebugRow
              k="retries"
              v={metrics.sfuReliability.consumeRetries}
              highlight={metrics.sfuReliability.consumeRetries > 0}
            />
            <DebugRow
              k="stale"
              v={metrics.sfuReliability.staleConsumer}
              highlight={metrics.sfuReliability.staleConsumer > 0}
            />
            <DebugRow
              k="failed"
              v={metrics.sfuReliability.consumeFailed}
              highlight={metrics.sfuReliability.consumeFailed > 0}
            />
          </DebugSection>
        </>
      )}
      <div style={{ fontWeight: 600, marginTop: 8, marginBottom: 4 }}>{t('voice.voiceDebug.events')}</div>
      {events.length === 0 && <div style={{ color: '#a3a3a3' }}>-</div>}
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
