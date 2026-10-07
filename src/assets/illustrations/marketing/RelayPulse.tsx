/**
 * The dashed relay line with pulsing nodes between the video and the previews.
 */
export default function RelayPulse() {
  return (
    <div className="relative py-4 pointer-events-none" aria-hidden="true">
      <svg viewBox="0 0 500 20" className="w-full max-w-2xl mx-auto block" preserveAspectRatio="xMidYMid meet">
        {[0, 1, 2, 3].map((i) => (
          <line
            key={`line-${i}`}
            x1={50 + i * 100} y1="10" x2={150 + i * 100} y2="10"
            stroke="#b4f953"
            strokeWidth="1"
            strokeDasharray="8 6"
            className="animate-dash-flow"
            style={{ opacity: 0.3 }}
          />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <circle
            key={`dot-${i}`}
            cx={50 + i * 100} cy="10" r="3"
            fill="#b4f953"
            className="animate-dot-pulse"
            style={{ animationDelay: `${i * 0.6}s`, transformOrigin: `${50 + i * 100}px 10px` }}
          />
        ))}
      </svg>
    </div>
  );
}
