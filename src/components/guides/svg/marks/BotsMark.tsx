export default function BotsMark() {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="obelisk-bots mark: a small robot head with antenna"
      className="w-full h-auto"
    >
      <rect width="120" height="120" rx="20" fill="#0a0a0a" />
      <rect x="3" y="3" width="114" height="114" rx="18" fill="#171717" stroke="#262626" strokeWidth="2" />

      {/* antenna */}
      <line x1="60" y1="22" x2="60" y2="34" stroke="#b4f953" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="20" r="4" fill="#b4f953" />

      {/* head */}
      <rect x="30" y="36" width="60" height="50" rx="10" fill="#171717" stroke="#b4f953" strokeWidth="3" />

      {/* eyes */}
      <circle cx="46" cy="56" r="5" fill="#b4f953" />
      <circle cx="74" cy="56" r="5" fill="#b4f953" />

      {/* mouth */}
      <rect x="44" y="70" width="32" height="6" rx="3" fill="#2d3a1a" stroke="#b4f953" strokeWidth="2" />

      {/* shoulders / base */}
      <rect x="38" y="90" width="44" height="8" rx="3" fill="#2d3a1a" stroke="#b4f953" strokeWidth="2" />
    </svg>
  );
}
