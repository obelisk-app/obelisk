import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/common/usePrefersReducedMotion';

/** Animate the wheel's angle, so every card follows the circular path on every frame. */
export function useRelayDeckMotion(initial: number) {
  const [position, setPosition] = useState(initial);
  const [settled, setSettled] = useState(true);
  const current = useRef(initial);
  const target = useRef(initial);
  const frame = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const stop = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const jump = (value: number) => {
    stop();
    current.current = value;
    target.current = value;
    setPosition(value);
    setSettled(false);
  };
  const animate = (value: number) => {
    stop();
    target.current = value;
    if (reducedMotion) { jump(value); setSettled(true); return; }
    const from = current.current;
    if (from === value) { setSettled(true); return; }
    setSettled(false);
    const started = performance.now();
    const duration = 360 + Math.min(200, Math.max(0, Math.abs(value - from) - 1) * 100);
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      current.current = from + (value - from) * eased;
      setPosition(current.current);
      if (progress === 1) setSettled(true);
      frame.current = progress < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
  };
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);
  return { position, settled, current, target, stop, jump, animate };
}
