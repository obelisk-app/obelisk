'use client';

/**
 * Buenos Aires Obelisco icon — uses currentColor so it adapts to any theme.
 * Traced from the project's obelisk.png silhouette.
 */
export default function ObeliskIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Two-face obelisco silhouette matching Buenos Aires monument */}
      <path d="
        M 256,16
        L 220,72
        L 196,460
        L 200,464
        L 256,464
        L 256,72
        Z
      " opacity="0.7" />
      <path d="
        M 256,16
        L 292,72
        L 316,460
        L 312,464
        L 256,464
        L 256,72
        Z
      " />
    </svg>
  );
}
