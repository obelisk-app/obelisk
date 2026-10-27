import KeyRowGlyph from './KeyRowGlyph';

/** One place the key can live, with its glyph. */
export default function KeyCardRow({ y, glyph, label }: { y: number; glyph: 'ext' | 'phone' | 'lock'; label: string }) {
  return (
    <g>
      <KeyRowGlyph kind={glyph} x={38} y={y - 4.5} />
      <text x="54" y={y} fontSize="13" fontWeight="600" fill="#fafafa">
        {label}
      </text>
    </g>
  );
}
