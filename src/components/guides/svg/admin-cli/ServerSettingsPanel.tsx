import { useTranslations } from 'next-intl';

/** The operator's server settings menu, drawn as the app shows it: five tools, operator only. */
export default function ServerSettingsPanel() {
  const t = useTranslations();
  const items = [
    t('guides.art.adminCli.itemProfile'),
    t('guides.art.adminCli.itemEmoji'),
    t('guides.art.adminCli.itemChannels'),
    t('guides.art.adminCli.itemRoles'),
    t('guides.art.adminCli.itemMembers'),
  ];

  return (
    <g>
      <rect x="30" y="64" width="230" height="272" rx="12" fill="#0f0f0f" stroke="#b4f953" strokeWidth="1.6" />
      <text x="46" y="90" fontSize="13" fontWeight="700" fill="#fafafa">
        {t('guides.art.adminCli.serverSettings')}
      </text>
      <text x="46" y="106" fontSize="10" fill="#a3a3a3">
        {t('guides.art.adminCli.operatorOnly')}
      </text>
      <line x1="46" y1="118" x2="244" y2="118" stroke="#262626" strokeWidth="1" />

      {items.map((label, i) => {
        const y = 128 + i * 40;
        return (
          <g
            key={i}
            className="animate-fade-in-up"
            style={{ animationDelay: `${i * 0.2}s`, animationFillMode: 'both' } as React.CSSProperties}
          >
            <rect x="46" y={y + 4} width="24" height="24" rx="6" fill="#2d3a1a" />
            <ItemGlyph index={i} x={58} y={y + 16} />
            <text x="80" y={y + 20} fontSize="11.5" fontWeight="600" fill="#fafafa">
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** A tiny line icon per tool: profile, emoji, channels, roles, members. */
function ItemGlyph({ index, x, y }: { index: number; x: number; y: number }) {
  const stroke = { stroke: '#b4f953', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const };
  switch (index) {
    case 0:
      return (
        <g {...stroke}>
          <rect x={x - 7} y={y - 6} width="14" height="12" rx="2" />
          <line x1={x - 7} y1={y - 1} x2={x + 7} y2={y - 1} />
        </g>
      );
    case 1:
      return (
        <g {...stroke}>
          <circle cx={x} cy={y} r="6" />
          <path d={`M${x - 3} ${y + 2} Q${x} ${y + 5} ${x + 3} ${y + 2}`} />
        </g>
      );
    case 2:
      return (
        <g {...stroke}>
          <line x1={x - 6} y1={y - 4} x2={x + 6} y2={y - 4} />
          <line x1={x - 3} y1={y} x2={x + 6} y2={y} />
          <line x1={x - 3} y1={y + 4} x2={x + 6} y2={y + 4} />
        </g>
      );
    case 3:
      return (
        <g {...stroke}>
          <path d={`M${x} ${y - 6} L${x + 6} ${y - 2} L${x + 4} ${y + 5} L${x - 4} ${y + 5} L${x - 6} ${y - 2} Z`} />
        </g>
      );
    default:
      return (
        <g {...stroke}>
          <circle cx={x - 2} cy={y - 2} r="3" />
          <path d={`M${x - 7} ${y + 6} Q${x - 2} ${y} ${x + 3} ${y + 6}`} />
          <circle cx={x + 4} cy={y - 3} r="2" />
        </g>
      );
  }
}
