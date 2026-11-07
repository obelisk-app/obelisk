import { useRef, useState, type PointerEvent, type KeyboardEvent, type MouseEvent, type WheelEvent } from 'react';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';

export function useRelayDeck(relays: readonly string[], activeRelay: string | null) {
  const initial = relays.findIndex(url => normalizeRelayUrl(url) === normalizeRelayUrl(activeRelay ?? ''));
  const [position, setPosition] = useState(Math.max(0, initial));
  const drag = useRef<{ y: number; position: number } | null>(null);
  const moved = useRef(false);
  const wheelTime = useRef(0);
  const count = relays.length;
  const front = count ? ((Math.round(position) % count) + count) % count : 0;
  const step = (direction: number) => setPosition(value => Math.round(value) + direction);
  const focus = (index: number) => {
    let distance = ((index - front) % count + count) % count;
    if (distance > count / 2) distance -= count;
    setPosition(Math.round(position) + distance);
  };
  return {
    position, front, focus, step,
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || count < 2) return;
      drag.current = { y: event.clientY, position };
      moved.current = false;
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!drag.current) return;
      const delta = drag.current.y - event.clientY;
      if (Math.abs(delta) > 10) {
        moved.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setPosition(drag.current.position + delta / 300);
      }
    },
    onPointerUp: () => {
      if (drag.current) setPosition(value => Math.round(value));
      drag.current = null;
    },
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
