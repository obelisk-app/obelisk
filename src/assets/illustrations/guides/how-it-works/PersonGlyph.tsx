/** A person: a head and shoulders, in lines. */
export default function PersonGlyph({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="2.4" fill="none" strokeLinecap="round">
      <circle cx={cx} cy={cy - 12} r="11" />
      <path d={`M${cx - 20} ${cy + 22} C ${cx - 20} ${cy + 4}, ${cx + 20} ${cy + 4}, ${cx + 20} ${cy + 22}`} />
    </g>
  );
}
