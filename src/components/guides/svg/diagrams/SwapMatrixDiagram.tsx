import { useTranslations } from 'next-intl';
import {
  SWAP_COL_W as COL_W, SWAP_COL_X as COL_X, SWAP_LABEL_X as LABEL_X, SWAP_ROW_HEIGHT as ROW_HEIGHT, SWAP_TOP as TOP,
  swapMatrixHeight, swapMatrixRows, type SwapRow,
} from '@/utils/guides/diagram-art';

export default function SwapMatrixDiagram() {
  const t = useTranslations();
  /** Project names (ours, strfry, nostr-rs-relay) stay as they are; the rest is copy. */
  const rows: SwapRow[] = [
    { layer: t('guides.art.swapMatrix.client'), ours: 'obelisk-dex', alts: [t('guides.art.swapMatrix.otherClients'), t('guides.art.swapMatrix.ownFork')] },
    { layer: t('guides.art.swapMatrix.voice'), ours: 'obelisk-sfu', alts: [t('guides.art.swapMatrix.anySfu'), t('guides.art.swapMatrix.peerToPeer')] },
    { layer: t('guides.art.swapMatrix.bots'), ours: 'obelisk-bots', alts: [t('guides.art.swapMatrix.ownBot'), t('guides.art.swapMatrix.anyKeypair')] },
    { layer: t('guides.art.swapMatrix.relay'), ours: 'obelisk-relay', alts: ['strfry', 'nostr-rs-relay'] },
  ];
  const height = swapMatrixHeight(rows.length);
  const grid = swapMatrixRows(rows);

  return (
    <svg
      viewBox={`0 0 ${COL_X[2] + COL_W + 24} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t('guides.art.swapMatrix.label')}
      className="w-full h-auto"
    >
      <rect width="100%" height="100%" fill="#0a0a0a" />

      <text
        x={LABEL_X}
        y="32"
        fontSize="14"
        fontWeight="700"
        fill="#fafafa"
      >
        {t('guides.art.swapMatrix.heading')}
      </text>
      <text
        x={COL_X[0] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#b4f953"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        {t('guides.art.swapMatrix.ours')}
      </text>
      <text
        x={COL_X[1] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#a3a3a3"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        {t('guides.art.swapMatrix.alternative')}
      </text>
      <text
        x={COL_X[2] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#a3a3a3"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        {t('guides.art.swapMatrix.alternative')}
      </text>

      {grid.map((row) => (
        <g key={row.layer}>
          {/* row label */}
          <text
            x={LABEL_X}
            y={row.y + 30}
            fontSize="13"
            fontWeight="700"
            fill="#a3a3a3"
          >
            {row.layer}
          </text>

          {/* connecting strand across the row */}
          <line
            x1={COL_X[0] + COL_W}
            y1={row.y + 24}
            x2={COL_X[2]}
            y2={row.y + 24}
            stroke="#b4f953"
            strokeWidth="1"
            strokeDasharray="3 6"
            strokeOpacity="0.4"
            className="animate-dash-flow"
            style={{ animationDelay: row.strandDelay } as React.CSSProperties}
          />

          {row.cells.map((cell) => (
            <g key={cell.label}>
              <rect
                x={cell.x}
                y={row.y}
                width={COL_W}
                height="48"
                rx="10"
                fill={cell.primary ? '#1e2812' : '#171717'}
                stroke={cell.primary ? '#b4f953' : '#262626'}
                strokeWidth={cell.primary ? '1.8' : '1'}
              />
              <text
                x={cell.x + COL_W / 2}
                y={row.y + 30}
                textAnchor="middle"
                fontSize="14"
                fontWeight={cell.primary ? '800' : '600'}
                fill={cell.primary ? '#b4f953' : '#fafafa'}
                fontFamily="monospace"
              >
                {cell.label}
              </text>
              {cell.primary && (
                <circle
                  cx={cell.x + 14}
                  cy={row.y + 24}
                  r="3"
                  fill="#b4f953"
                  className="animate-dot-pulse"
                  style={{
                    transformOrigin: `${cell.x + 14}px ${row.y + 24}px`,
                    animationDelay: cell.dotDelay,
                  } as React.CSSProperties}
                />
              )}
            </g>
          ))}
        </g>
      ))}

      <text
        x={LABEL_X}
        y={TOP + rows.length * ROW_HEIGHT + 22}
        fontSize="11"
        fontWeight="600"
        fill="#a3a3a3"
        fontFamily="monospace"
      >
        {t('guides.art.swapMatrix.footer')}
      </text>
    </svg>
  );
}
