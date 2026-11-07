import { useRef, type PointerEvent, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { relayDeckDrag, relayDeckSwipeTarget } from '@/utils/relay/deck-swipe';
import { useRelayDeckMotion } from './useRelayDeckMotion';

type Drag = { y: number; position: number; lastY: number; lastAt: number; velocity: number };

export function useRelayDeck(relays: readonly string[], activeRelay: string | null) {
  const initial = relays.findIndex(url => normalizeRelayUrl(url) === normalizeRelayUrl(activeRelay ?? ''));
  const motion = useRelayDeckMotion(Math.max(0, initial));
  const drag = useRef<Drag | null>(null);
  const moved = useRef(false);
  const wheelTime = useRef(0);
  const count = relays.length;
  const front = count ? ((Math.round(motion.position) % count) + count) % count : 0;
  const step = (direction: number) => {
    if (count > 1) motion.animate(Math.round(motion.target.current) + direction);
  };
  const focus = (index: number) => {
    if (!count) return;
    const current = Math.round(motion.current.current);
    let distance = ((index - current) % count + count) % count;
    if (distance > count / 2) distance -= count;
    motion.animate(current + distance);
  };
  const endPress = (event: PointerEvent<HTMLDivElement>) => {
    const press = drag.current;
    if (!press) return;
    drag.current = null;
    const velocity = event.timeStamp - press.lastAt > 100 ? 0 : press.velocity;
    motion.animate(relayDeckSwipeTarget(press.position, event.clientY - press.y, velocity, count, event.type === 'pointercancel'));
  };
  return {
    position: motion.position, front, settled: motion.settled, focus, step,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || count < 2) return;
      motion.stop();
      drag.current = { y: event.clientY, position: motion.current.current, lastY: event.clientY, lastAt: event.timeStamp, velocity: 0 };
      moved.current = false;
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const press = drag.current;
      if (!press) return;
      const delta = event.clientY - press.y;
      if (Math.abs(delta) > 10 || moved.current) {
        moved.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        const elapsed = event.timeStamp - press.lastAt;
        if (elapsed > 0) press.velocity = (event.clientY - press.lastY) * 1000 / elapsed;
        press.lastY = event.clientY;
        press.lastAt = event.timeStamp;
        motion.jump(relayDeckDrag(press.position, delta, count));
      }
    },
    onPointerUp: endPress,
    onClickCapture: (event: MouseEvent) => {
      if (moved.current) { event.preventDefault(); event.stopPropagation(); moved.current = false; }
    },
    onWheel: (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8 || Date.now() - wheelTime.current < 360 || count < 2) return;
      wheelTime.current = Date.now();
      step(event.deltaY > 0 ? 1 : -1);
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (count < 2 || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') focus(0);
      else if (event.key === 'End') focus(count - 1);
      else step(event.key === 'ArrowDown' ? 1 : -1);
    },
  };
}
