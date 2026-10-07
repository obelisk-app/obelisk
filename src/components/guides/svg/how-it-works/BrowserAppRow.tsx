import BrowserRowGlyph from './BrowserRowGlyph';

const DIM = '#5c7a2e';

/** One row of the browser window: the static pages or the app, with its glyph, name and line under it. */
export default function BrowserAppRow({ y, title, sub, glyph, lit = false }: { y: number; title: string; sub: string; glyph: 'page' | 'chat'; lit?: boolean }) {
  return (
    <g>
      <rect x="24" y={y} width="220" height="40" rx="8" fill="#141414" stroke={lit ? '#b4f953' : DIM} strokeWidth="1.2" />
      <rect x="32" y={y + 7} width="26" height="26" rx="6" fill="#2d3a1a" />
      <BrowserRowGlyph kind={glyph} x={45} y={y + 20} />
      <text x="66" y={y + 17} fontSize="11.5" fontWeight="700" fill="#fafafa">
        {title}
      </text>
      <text x="66" y={y + 31} fontSize="9.5" fill="#a3a3a3">
        {sub}
      </text>
    </g>
  );
}
