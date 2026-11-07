/** Vertical wheel geometry shared with the wallet connection deck. */
export function relayDeckFrame(index: number, position: number, count: number) {
  if (count <= 1) return { transform: 'perspective(900px)', opacity: 1, zIndex: 1 };
  const distance = ((index - position + count / 2) % count + count) % count - count / 2;
  const angle = distance * (Math.PI * 2 / Math.min(count, 6));
  const depth = (Math.cos(angle) + 1) / 2;
  const visible = count > 6 ? Math.max(0, Math.min(1, (3 - Math.abs(distance)) * 2)) : 1;
  return {
    transform: `perspective(900px) translateY(${Math.sin(angle) * 112}px) scale(${0.68 + depth * 0.32}) rotateX(${-Math.sin(angle) * 42}deg)`,
    opacity: (0.65 + (Math.abs(distance) < 0.1 ? 0.35 : 0)) * visible,
    zIndex: Math.round(depth * 1000) * count + count - index,
  };
}
