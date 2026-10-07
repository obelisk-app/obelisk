import {
  STACKER_CELL as CELL, STACKER_COLS as COLS, STACKER_ROWS as ROWS, STACKER_TOP as TOP,
  wellBlocks, wellGarbage, type Block,
} from '@/utils/guides/stacker-art';

/** One Stacker well at `x`: its frame, its faint grid, any garbage rows it received, its blocks and the row about to clear. */
export default function StackerWell({
  x,
  blocks,
  garbageRows,
  clearRow,
}: {
  x: number;
  blocks: Block[];
  garbageRows?: number[];
  clearRow?: number;
}) {
  const garbage = wellGarbage(x, garbageRows);
  const placed = wellBlocks(x, blocks);
  return (
    <g>
      <rect
        x={x - 5}
        y={TOP - 5}
        width={CELL * COLS + 10}
        height={CELL * ROWS + 10}
        rx="10"
        fill="#08080a"
        stroke="#262626"
      />
      {/* the well's own grid, faint */}
      <g stroke="#ffffff" strokeOpacity="0.04">
        {Array.from({ length: COLS - 1 }, (_, i) => (
          <line key={`v${i}`} x1={x + (i + 1) * CELL} y1={TOP} x2={x + (i + 1) * CELL} y2={TOP + ROWS * CELL} />
        ))}
      </g>

      {garbage.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x}
          y={cell.y}
          width={CELL - 2}
          height={CELL - 2}
          rx="4"
          fill={cell.fill}
        />
      ))}

      {placed.map((cell) => (
        <rect
          key={cell.key}
          x={cell.x}
          y={cell.y}
          width={CELL - 2}
          height={CELL - 2}
          rx="4"
          fill={cell.fill}
          fillOpacity="0.92"
        />
      ))}

      {clearRow !== undefined && (
        <rect
          x={x - 4}
          y={TOP + clearRow * CELL - 3}
          width={CELL * COLS + 8}
          height={CELL + 6}
          rx="7"
          fill="#b4f953"
          fillOpacity="0.14"
          stroke="#b4f953"
          strokeOpacity="0.85"
          strokeWidth="2"
        />
      )}
    </g>
  );
}
