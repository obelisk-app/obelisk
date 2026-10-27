/** A few relays side by side: other Nostr relays. */
export default function RelaysGlyph() {
  const nodes: [number, number, number][] = [[-6, -3, 4.5], [5, -5, 3.6], [3, 6, 4]];
  return (
    <g>
      {nodes.map(([cx, cy, r]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={r} fill="none" stroke="#b4f953" strokeWidth="1.3" />
      ))}
    </g>
  );
}
