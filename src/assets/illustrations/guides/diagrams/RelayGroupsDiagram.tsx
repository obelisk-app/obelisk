import { useTranslations } from 'next-intl';
import { relayGroupClients } from '@/utils/guides/diagram-art';

/** The four people connecting to the relay; each one's link is worked out in `diagram-art.ts`. */
const CLIENTS = relayGroupClients([
  { x: 80, y: 90, label: 'alice' },
  { x: 80, y: 220, label: 'bob' },
  { x: 720, y: 90, label: 'carol' },
  { x: 720, y: 220, label: 'dan' },
]);

export default function RelayGroupsDiagram() {
  const t = useTranslations();
  return (
    <svg
      viewBox="0 0 800 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t('guides.art.relayGroups.label')}
      className="w-full h-auto"
    >
      <rect width="800" height="360" fill="#0a0a0a" />

      <text x="400" y="34" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fafafa">
        {t('guides.art.relayGroups.heading')}
      </text>

      {/* relay in the center */}
      <g>
        <rect
          x="280"
          y="120"
          width="240"
          height="160"
          rx="14"
          fill="#171717"
          stroke="#b4f953"
          strokeWidth="2"
        />
        <rect x="298" y="138" width="204" height="24" rx="6" fill="#2d3a1a" />
        <text x="400" y="155" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953" fontFamily="monospace">
          relay.group.host
        </text>

        {/* group metadata rows */}
        {[
          { y: 180, k: t('guides.art.relayGroups.members'), v: '42' },
          { y: 200, k: t('guides.art.relayGroups.roles'), v: t('guides.art.relayGroups.rolesValue') },
          { y: 220, k: t('guides.art.relayGroups.events'), v: t('guides.art.relayGroups.eventsValue') },
          { y: 240, k: t('guides.art.relayGroups.adminCheck'), v: t('guides.art.relayGroups.adminCheckValue') },
        ].map((r) => (
          <g key={r.y}>
            <text x="302" y={r.y} fontSize="11" fontWeight="600" fill="#a3a3a3" fontFamily="monospace">
              {r.k}
            </text>
            <text x="498" y={r.y} textAnchor="end" fontSize="11" fill="#fafafa" fontFamily="monospace">
              {r.v}
            </text>
          </g>
        ))}
        <text x="400" y="270" textAnchor="middle" fontSize="10" fill="#b4f953">
          {t('guides.art.relayGroups.noServer')}
        </text>
      </g>

      {/* clients connecting */}
      {CLIENTS.map((c) => (
        <g key={c.label}>
          <rect
            x={c.x - 30}
            y={c.y - 20}
            width="60"
            height="40"
            rx="8"
            fill="#171717"
            stroke="#b4f953"
            strokeWidth="1.5"
          />
          <circle cx={c.x} cy={c.y - 4} r="5" fill="#b4f953" />
          <rect x={c.x - 10} y={c.y + 4} width="20" height="8" rx="3" fill="#2d3a1a" />
          <text x={c.x} y={c.y + 35} textAnchor="middle" fontSize="10" fontWeight="600" fill="#a3a3a3">
            {c.label}
          </text>

          <line
            x1={c.fromX}
            y1={c.y}
            x2={c.toX}
            y2={c.toY}
            stroke="#b4f953"
            strokeWidth="1.5"
            strokeDasharray="4 8"
            className="animate-dash-flow"
          />
        </g>
      ))}

      {/* footer */}
      <text x="400" y="330" textAnchor="middle" fontSize="11" fill="#a3a3a3" fontFamily="monospace">
        {t('guides.art.relayGroups.footer')}
      </text>
    </svg>
  );
}
