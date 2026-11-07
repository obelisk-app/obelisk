/** The wallet connection deck's vertical circular wheel, evaluated at a continuous position. */
export function relayDeckFrame(index: number, position: number, count: number) {
  const distance = count <= 1 ? 0 : ((index - position + count / 2) % count + count) % count - count / 2;
  const angle = count <= 1 ? 0 : distance * (Math.PI * 2 / Math.min(count, 6));
  const depth = (Math.cos(angle) + 1) / 2;
  const visible = count > 6 ? Math.max(0, Math.min(1, (3 - Math.abs(distance)) * 2)) : 1;
  const contentOpacity = 1 - Math.max(0, Math.min(1, (Math.abs(distance) - 0.1) / 0.35));
  // Two cards otherwise share the same vertical center at rest and hide the rear card.
  const y = Math.sin(angle) * 112 + (count === 2 ? (1 - depth) * 72 : 0);
  return {
    style: {
      transform: `perspective(900px) translateY(${y}px) scale(${0.68 + depth * 0.32}) rotateX(${-Math.sin(angle) * 42}deg)`,
      opacity: (0.65 + contentOpacity * 0.35) * visible,
      zIndex: Math.round(depth * 1000) * Math.max(1, count) + count - index,
      pointerEvents: visible === 0 ? 'none' as const : undefined,
    },
    contentStyle: { opacity: contentOpacity },
    peekStyle: { opacity: 1 - contentOpacity, top: y < 0 ? 12 : undefined, bottom: y < 0 ? undefined : 8 },
  };
}
