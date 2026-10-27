import PersonGlyph from './PersonGlyph';

/** A few people together: a community. */
export default function CommunityGlyph({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g>
      <g opacity="0.55">
        <PersonGlyph cx={cx - 26} cy={cy + 4} color={color} />
        <PersonGlyph cx={cx + 26} cy={cy + 4} color={color} />
      </g>
      <PersonGlyph cx={cx} cy={cy - 2} color={color} />
    </g>
  );
}
