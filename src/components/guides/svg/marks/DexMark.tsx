export default function DexMark() {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="obelisk-dex mark: a chat bubble containing an obelisk"
      className="w-full h-auto"
    >
      <rect width="120" height="120" rx="20" fill="#0a0a0a" />
      <rect x="3" y="3" width="114" height="114" rx="18" fill="#171717" stroke="#262626" strokeWidth="2" />

      {/* chat bubble */}
      <path
        d="M22 36 Q22 26 32 26 H88 Q98 26 98 36 V72 Q98 82 88 82 H52 L40 94 V82 H32 Q22 82 22 72 Z"
        fill="none"
        stroke="#b4f953"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* obelisk inside */}
      <polygon points="60,38 67,72 53,72" fill="#b4f953" />
      <rect x="51" y="72" width="18" height="4" fill="#8bc34a" />
    </svg>
  );
}
