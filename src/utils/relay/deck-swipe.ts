/** Wallet connection-wheel gesture rules: bounded drag and velocity-aware snapping. */
export function relayDeckDrag(start: number, translation: number, count: number): number {
  const limit = Math.min(3, Math.max(0, count - 1));
  return start - Math.max(-limit, Math.min(limit, translation / 300));
}

export function relayDeckSwipeTarget(start: number, translation: number, velocity: number, count: number, canceled = false): number {
  const origin = Math.round(start);
  if (canceled || count < 2) return origin;
  const distance = Math.abs(translation);
  const flick = Math.abs(velocity) > 450 && distance > 20;
  if (distance < 36 && !flick) return origin;
  const momentum = distance >= 180 && velocity * translation > 0 && Math.abs(velocity) >= 900
    ? Math.abs(velocity) * 0.2 / 300 : 0;
  const steps = Math.min(3, count - 1, Math.max(1, Math.round(distance / 300 + momentum)));
  return origin + (translation < 0 ? 1 : -1) * steps;
}
