/**
 * Per-peer connection-quality monitor. Polls `RTCPeerConnection.getStats()`
 * every 2s and emits a `QualitySample` summarising RTT, loss, jitter, and
 * outbound bitrate/fps. Each peer-pair is independent — this module is
 * stateless across peers, the caller starts one monitor per `Peer`.
 *
 * Also drives the auto-mode adaptive loop: when video quality is `'auto'`
 * and stats stay poor for 5s, downshift the outbound video sender; recover
 * after 15s of clean readings.
 */

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface QualitySample {
  level: QualityLevel;
  /** Round-trip time in ms (from nominated candidate pair). */
  rttMs: number | null;
  /** Loss as 0..1. */
  loss: number | null;
  /** Jitter in ms (mean of inbound RTPs). */
  jitterMs: number | null;
  /** Outbound video bitrate in bits/s. */
  outboundVideoBps: number | null;
  /** Outbound video frames per second. */
  outboundFps: number | null;
  /** "bandwidth" | "cpu" | "other" | "none" */
  qualityLimitationReason: string | null;
}

export interface StatsMonitorHandle {
  stop(): void;
}

const POLL_MS = 2000;

export function startStatsMonitor(
  pc: RTCPeerConnection,
  onSample: (s: QualitySample) => void,
): StatsMonitorHandle {
  let lastOutbound: { bytes: number; ts: number; frames: number } | null = null;
  let lastInbound: { packetsLost: number; packetsReceived: number } | null = null;
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const report = await pc.getStats();
      const sample = computeSample(report, lastOutbound, lastInbound);
      lastOutbound = sample._outboundCursor;
      lastInbound = sample._inboundCursor;
      onSample(sample.sample);
    } catch {
      /* ignore — peer may be tearing down */
    }
  }, POLL_MS);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

interface ComputeResult {
  sample: QualitySample;
  _outboundCursor: { bytes: number; ts: number; frames: number } | null;
  _inboundCursor: { packetsLost: number; packetsReceived: number } | null;
}

export function computeSample(
  report: RTCStatsReport,
  prevOutbound: { bytes: number; ts: number; frames: number } | null,
  prevInbound: { packetsLost: number; packetsReceived: number } | null,
): ComputeResult {
  let rttMs: number | null = null;
  let jitterTotal = 0;
  let jitterN = 0;
  let inboundLost = 0;
  let inboundReceived = 0;
  let outboundBytes = 0;
  let outboundFrames = 0;
  let outboundTs = 0;
  let qualityLimitationReason: string | null = null;
  let outboundFpsCurrent: number | null = null;

  report.forEach((s) => {
    const t = (s as { type?: string }).type;
    if (t === 'candidate-pair') {
      const cp = s as RTCStatsReport extends infer _ ? Record<string, unknown> : never;
      const c = cp as Record<string, unknown>;
      if (c.nominated || c.state === 'succeeded') {
        const rtt = c.currentRoundTripTime;
        if (typeof rtt === 'number') rttMs = rtt * 1000;
      }
    } else if (t === 'inbound-rtp') {
      const c = s as Record<string, unknown>;
      if (typeof c.jitter === 'number') {
        jitterTotal += c.jitter * 1000;
        jitterN++;
      }
      if (typeof c.packetsLost === 'number') inboundLost += c.packetsLost;
      if (typeof c.packetsReceived === 'number') inboundReceived += c.packetsReceived;
    } else if (t === 'outbound-rtp') {
      const c = s as Record<string, unknown>;
      if (c.kind === 'video') {
        if (typeof c.bytesSent === 'number') outboundBytes += c.bytesSent;
        if (typeof c.framesEncoded === 'number') outboundFrames += c.framesEncoded;
        if (typeof c.timestamp === 'number') outboundTs = Math.max(outboundTs, c.timestamp);
        if (typeof c.framesPerSecond === 'number') outboundFpsCurrent = c.framesPerSecond;
        if (typeof c.qualityLimitationReason === 'string') {
          qualityLimitationReason = c.qualityLimitationReason;
        }
      }
    }
  });

  let outboundVideoBps: number | null = null;
  if (prevOutbound && outboundTs > prevOutbound.ts) {
    const dt = (outboundTs - prevOutbound.ts) / 1000;
    if (dt > 0) outboundVideoBps = ((outboundBytes - prevOutbound.bytes) * 8) / dt;
  }

  let loss: number | null = null;
  if (prevInbound) {
    const dLost = inboundLost - prevInbound.packetsLost;
    const dRecv = inboundReceived - prevInbound.packetsReceived;
    const total = dLost + dRecv;
    if (total > 0) loss = Math.max(0, dLost / total);
  }

  const jitterMs = jitterN > 0 ? jitterTotal / jitterN : null;
  const level = scoreQuality({ rttMs, loss, jitterMs });

  return {
    sample: {
      level,
      rttMs,
      loss,
      jitterMs,
      outboundVideoBps,
      outboundFps: outboundFpsCurrent,
      qualityLimitationReason,
    },
    _outboundCursor: outboundTs > 0 ? { bytes: outboundBytes, ts: outboundTs, frames: outboundFrames } : prevOutbound,
    _inboundCursor: inboundReceived > 0 || inboundLost > 0 ? { packetsLost: inboundLost, packetsReceived: inboundReceived } : prevInbound,
  };
}

export function scoreQuality(input: { rttMs: number | null; loss: number | null; jitterMs: number | null }): QualityLevel {
  const { rttMs, loss, jitterMs } = input;
  if (rttMs == null && loss == null && jitterMs == null) return 'unknown';
  const buckets: QualityLevel[] = [];
  if (rttMs != null) buckets.push(rttMs < 100 ? 'excellent' : rttMs < 200 ? 'good' : rttMs < 400 ? 'fair' : 'poor');
  if (loss != null) buckets.push(loss < 0.01 ? 'excellent' : loss < 0.03 ? 'good' : loss < 0.08 ? 'fair' : 'poor');
  if (jitterMs != null) buckets.push(jitterMs < 30 ? 'excellent' : jitterMs < 60 ? 'good' : jitterMs < 120 ? 'fair' : 'poor');
  // Worst dimension wins.
  const order: QualityLevel[] = ['poor', 'fair', 'good', 'excellent'];
  for (const l of order) if (buckets.includes(l)) return l;
  return 'unknown';
}

/** Color tokens for the per-peer dot. */
export function qualityColor(l: QualityLevel): string {
  switch (l) {
    case 'excellent': return '#22c55e';
    case 'good': return '#84cc16';
    case 'fair': return '#f59e0b';
    case 'poor': return '#ef4444';
    default: return '#737373';
  }
}
