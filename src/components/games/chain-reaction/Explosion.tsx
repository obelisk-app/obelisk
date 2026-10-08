import type { CSSVars } from '@/types/games/chain-reaction/css-vars';

/** The burst a critical cell leaves behind as it splits into its neighbours. */
export default function Explosion({ hex }: { hex: string }) {
  // Bright burst fills the cell then blooms outward; four shards fly to
  // adjacent cells. Absolutely-positioned overlay that overflows the cell
  // so shards leak into neighbour cells, which is exactly the feel we want.
  const shardStyle = (dx: number, dy: number): CSSVars => ({
    background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.95) 0%, ${hex} 45%, color-mix(in srgb, ${hex} 45%, black) 100%)`,
    boxShadow: `0 0 10px ${hex}`,
    '--cr-shard-dx': `${dx}px`,
    '--cr-shard-dy': `${dy}px`,
    color: hex,
  });
  return (
    <div className="cr-burst" style={{ color: hex }} aria-hidden>
      <span
        className="cr-burst-core"
        style={{
          background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${hex} 40%, transparent 70%)`,
        }}
      />
      <span
        className="cr-burst-ring"
        style={{ borderColor: hex, boxShadow: `0 0 12px ${hex}` }}
      />
      <span className="cr-shard" style={shardStyle(0, -22)} />
      <span className="cr-shard" style={shardStyle(0, 22)} />
      <span className="cr-shard" style={shardStyle(-22, 0)} />
      <span className="cr-shard" style={shardStyle(22, 0)} />
    </div>
  );
}
