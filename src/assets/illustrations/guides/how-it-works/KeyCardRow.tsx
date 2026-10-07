import KeyRowGlyph from './KeyRowGlyph';

/** One place the key can live, with its glyph. */
export default function KeyCardRow({ y, glyph, label }: { y: number; glyph: 'ext' | 'phone' | 'lock'; label: string }) {
  return (
    <g>
      <KeyRowGlyph kind={glyph} x={36} y={y - 4} />
      <text x="50" y={y} fontSize="10.5" fontWeight="600" fill="#fafafa">
        {label}
      </text>
    </g>
  );
}
