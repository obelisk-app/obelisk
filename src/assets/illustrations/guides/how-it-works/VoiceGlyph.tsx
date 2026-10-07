/** Three peers meshed together. */
export default function VoiceGlyph() {
  const peers: [number, number][] = [[0, -7], [-7, 5], [7, 5]];
  return (
    <g>
      <path d="M0 -7 L-7 5 L7 5 Z" fill="none" stroke="#b4f953" strokeWidth="1.1" opacity="0.8" />
      {peers.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="2.8" fill="#b4f953" />
      ))}
    </g>
  );
}
