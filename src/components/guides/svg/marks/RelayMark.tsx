export default function RelayMark() {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="obelisk-relay mark: a relay tower broadcasting concentric signal arcs"
      className="w-full h-auto"
    >
      <rect width="120" height="120" rx="20" fill="#0a0a0a" />
      <rect x="3" y="3" width="114" height="114" rx="18" fill="#171717" stroke="#262626" strokeWidth="2" />

      {/* broadcast arcs — sit above the tower top, never overlap the tower */}
      <path
        d="M34 32 Q60 12 86 32"
        fill="none"
        stroke="#b4f953"
        strokeWidth="2.5"
        strokeOpacity="0.4"
        strokeLinecap="round"
      />
      <path
        d="M42 34 Q60 20 78 34"
        fill="none"
        stroke="#b4f953"
        strokeWidth="2.5"
        strokeOpacity="0.7"
        strokeLinecap="round"
      />
      <path
        d="M50 36 Q60 28 70 36"
        fill="none"
        stroke="#b4f953"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* tower top dot */}
      <circle cx="60" cy="44" r="3.5" fill="#b4f953" />

      {/* tower legs */}
      <polygon points="60,44 46,96 74,96" fill="none" stroke="#b4f953" strokeWidth="3" strokeLinejoin="round" />
      <line x1="53" y1="68" x2="67" y2="68" stroke="#b4f953" strokeWidth="2" />
      <line x1="49" y1="82" x2="71" y2="82" stroke="#b4f953" strokeWidth="2" />

      {/* base */}
      <rect x="40" y="96" width="40" height="5" rx="2" fill="#8bc34a" />
    </svg>
  );
}
