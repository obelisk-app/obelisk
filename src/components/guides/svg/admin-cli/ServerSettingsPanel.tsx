import { useTranslations } from 'next-intl';
import { stackRows } from '@/utils/guides/art-geometry';
import ServerItemGlyph from './ServerItemGlyph';

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
  const rows = stackRows(items.map((label) => ({ label })), 128, 40);

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

      {rows.map((row) => (
        <g
          key={row.i}
          className="animate-fade-in-up"
          style={{ animationDelay: `${row.i * 0.2}s`, animationFillMode: 'both' } as React.CSSProperties}
        >
          <rect x="46" y={row.y + 4} width="24" height="24" rx="6" fill="#2d3a1a" />
          <ServerItemGlyph index={row.i} x={58} y={row.y + 16} />
          <text x="80" y={row.y + 20} fontSize="11.5" fontWeight="600" fill="#fafafa">
            {row.label}
          </text>
        </g>
      ))}
    </g>
  );
}
