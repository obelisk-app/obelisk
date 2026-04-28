// Short, synthesized "ping" for real-time mentions.
// WebAudio so we don't need to ship an asset; volume is intentionally soft.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function beep(ac: AudioContext): void {
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.4);
}

export function playMentionSound(): void {
  try {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') {
      // Resume is async; schedule the beep after it resolves so `currentTime`
      // is valid and the oscillator actually plays.
      ac.resume().then(() => beep(ac)).catch(() => {});
      return;
    }
    beep(ac);
  } catch {
    // no-op
  }
}

// Prime the AudioContext on the first user gesture so later programmatic
// plays (triggered by socket events, not gestures) are allowed to make noise.
if (typeof window !== 'undefined') {
  const prime = () => {
    const ac = getCtx();
    if (ac && ac.state === 'suspended') ac.resume().catch(() => {});
    window.removeEventListener('pointerdown', prime);
    window.removeEventListener('keydown', prime);
  };
  window.addEventListener('pointerdown', prime, { once: false });
  window.addEventListener('keydown', prime, { once: false });
}
