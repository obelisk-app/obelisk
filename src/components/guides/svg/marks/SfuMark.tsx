export default function SfuMark() {
  const peers = [
    { x: 30, y: 30 },
    { x: 90, y: 30 },
    { x: 22, y: 70 },
    { x: 98, y: 70 },
    { x: 60, y: 96 },
  ];
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="obelisk-sfu mark: a central voice mixer hub connected to five peers"
      className="w-full h-auto"
    >
      <rect width="120" height="120" rx="20" fill="#0a0a0a" />
      <rect x="3" y="3" width="114" height="114" rx="18" fill="#171717" stroke="#262626" strokeWidth="2" />

      {/* spokes */}
      {peers.map((p) => (
        <line
          key={`${p.x}-${p.y}`}
          x1="60"
          y1="60"
          x2={p.x}
          y2={p.y}
          stroke="#b4f953"
          strokeOpacity="0.5"
          strokeWidth="2"
        />
      ))}

      {/* peers */}
      {peers.map((p) => (
        <circle key={`c-${p.x}-${p.y}`} cx={p.x} cy={p.y} r="6" fill="#2d3a1a" stroke="#b4f953" strokeWidth="2" />
      ))}

      {/* SFU hub */}
      <circle cx="60" cy="60" r="14" fill="#b4f953" />
      <circle cx="60" cy="60" r="20" fill="none" stroke="#b4f953" strokeWidth="2" strokeOpacity="0.4" />
    </svg>
  );
}
