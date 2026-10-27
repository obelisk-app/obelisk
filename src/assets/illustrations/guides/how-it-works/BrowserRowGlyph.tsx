/** The line icon on the app tile: a chat bubble. */
export default function BrowserRowGlyph({ x, y }: { x: number; y: number }) {
  return (
    <path
      d={`M${x - 7} ${y - 5} h14 v9 h-8 l-3.5 3.5 v-3.5 h-2.5 z`}
      stroke="#b4f953" strokeWidth={1.3} fill="none" strokeLinecap="round"
    />
  );
}
