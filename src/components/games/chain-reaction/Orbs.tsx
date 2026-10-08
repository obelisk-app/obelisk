import type { CSSVars } from '@/types/games/chain-reaction/css-vars';

/** One to three glowing spheres in a cell; two or more orbit when the cell is close to bursting. */
export default function Orbs({ count, hex, orbit, orb }: { count: number; hex: string; orbit: boolean; orb: number }) {
  if (count <= 0) return null;
  const dots = Math.min(count, 3);
  // Orbs touch each other: offsets are a share of the orb diameter so a ball
  // sits flush against its neighbours at any board size (centre-to-centre ≈
  // diameter). They were hardcoded for a 10px orb.
  const near = orb * 0.45;
  const offsets: Array<[number, number]> =
    dots === 1 ? [[0, 0]]
    : dots === 2 ? [[-near, 0], [near, 0]]
    : [[-near, orb * 0.3], [near, orb * 0.3], [0, -near]];
  const dur = `${Math.max(0.9, 2.6 - dots * 0.5)}s`;
  // Stack three gradients: a tight specular highlight, the main lit sphere,
  // and a dark crescent on the far side, which reads much more 3D than one ramp.
  const sphere = [
    // Tight specular, then the lit body, then a dark crescent on the far
    // side. Three stops read as a sphere; one reads as a circle.
    `radial-gradient(circle at 30% 24%, rgba(255,255,255,0.98) 0%, rgba(255,255,255,0) 20%)`,
    `radial-gradient(circle at 34% 32%, color-mix(in srgb, ${hex} 8%, white) 0%, ${hex} 42%, color-mix(in srgb, ${hex} 55%, black) 88%)`,
    `radial-gradient(circle at 74% 80%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 42%)`,
  ].join(', ');
  return (
    <div
      className={`cr-orb-group ${orbit ? '' : 'cr-orb-group--still'}`}
      style={{ '--cr-orbit-dur': dur } as CSSVars}
    >
      {offsets.map(([dx, dy], i) => (
        <span
          key={`${count}-${i}`}
          className="cr-orb cr-orb--3d"
          style={{
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`,
            background: sphere,
            boxShadow: [
              `0 0 ${orb}px ${hex}`,
              `0 0 ${orb * 2}px color-mix(in srgb, ${hex} 45%, transparent)`,
              `0 1px 2px rgba(0,0,0,0.6)`,
              `inset -1.5px -2px 2.5px color-mix(in srgb, ${hex} 40%, black)`,
              `inset 1.5px 2px 1.5px rgba(255,255,255,0.35)`,
            ].join(', '),
            color: hex,
          }}
        />
      ))}
    </div>
  );
}
