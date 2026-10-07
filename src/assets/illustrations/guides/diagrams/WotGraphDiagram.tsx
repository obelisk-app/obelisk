import { useTranslations } from 'next-intl';

export default function WotGraphDiagram() {
  const t = useTranslations();
  return (
    <svg
      viewBox="0 0 800 320"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t('guides.art.wotGraph.label')}
      className="w-full h-auto"
    >
      <rect width="800" height="320" fill="#0a0a0a" />

      {/* steps */}
      {[
        { x: 60, title: 'kind 3', sub: t('guides.art.wotGraph.followList'), n: 1 }, // i18n-exempt: protocol term, the event kind
        { x: 260, title: t('guides.art.wotGraph.graphWalk'), sub: t('guides.art.wotGraph.hops'), n: 2 },
        { x: 460, title: t('guides.art.wotGraph.score'), sub: t('guides.art.wotGraph.weightedSum'), n: 3 },
        { x: 660, title: t('guides.art.wotGraph.gate'), sub: t('guides.art.wotGraph.allowFilter'), n: 4 },
      ].map((step, i) => (
        <g key={i}>
          <rect
            x={step.x}
            y="110"
            width="140"
            height="90"
            rx="12"
            fill="#171717"
            stroke="#b4f953"
            strokeWidth="1.5"
          />
          <circle cx={step.x + 20} cy="128" r="12" fill="#b4f953" />
          <text
            x={step.x + 20}
            y="133"
            textAnchor="middle"
            fontSize="12"
            fontWeight="800"
            fill="#0a0a0a"
          >
            {step.n}
          </text>
          <text
            x={step.x + 40}
            y="134"
            fontSize="13"
            fontWeight="700"
            fill="#fafafa"
          >
            {step.title}
          </text>
          <text
            x={step.x + 70}
            y="175"
            textAnchor="middle"
            fontSize="11"
            fill="#a3a3a3"
            fontFamily="monospace"
          >
            {step.sub}
          </text>
        </g>
      ))}

      {/* connecting arrows */}
      <g stroke="#b4f953" strokeWidth="2" fill="none" strokeLinecap="round">
        {[200, 400, 600].map((x, i) => (
          <g key={i}>
            <line
              x1={x}
              y1="155"
              x2={x + 60}
              y2="155"
              strokeDasharray="6 6"
              className="animate-dash-flow"
              style={{ animationDelay: `${i * 0.3}s` } as React.CSSProperties}
            />
            <polygon points={`${x + 54},151 ${x + 62},155 ${x + 54},159`} fill="#b4f953" />
          </g>
        ))}
      </g>

      {/* formula */}
      <g>
        <rect x="200" y="240" width="400" height="56" rx="8" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1" />
        <text
          x="400"
          y="264"
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="#b4f953"
          fontFamily="monospace"
        > {/* i18n-exempt: the formula, its terms are variable names */}
          score = Σ (hop_weight × mutual_bonus × activity)
        </text>
        <text x="400" y="284" textAnchor="middle" fontSize="10" fill="#a3a3a3">
          {t('guides.art.wotGraph.threshold')}
        </text>
      </g>

      {/* title */}
      <text x="400" y="40" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fafafa">
        {t('guides.art.wotGraph.heading')}
      </text>
      <text x="400" y="62" textAnchor="middle" fontSize="11" fill="#a3a3a3">
        {t('guides.art.wotGraph.subheading')}
      </text>
    </svg>
  );
}
