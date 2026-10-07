import { stackRows } from '@/utils/guides/art-geometry';

/** A titled column of radio options, one of them picked: the channel's access or type. */
export default function RadioColumn({ x, title, options, selected }: { x: number; title: string; options: string[]; selected: number }) {
  const rows = stackRows(options.map((label) => ({ label })), 158, 20);
  return (
    <g>
      <text x={x} y="138" fontSize="9.5" fontWeight="700" fill="#a3a3a3" letterSpacing="0.6">
        {title}
      </text>
      {rows.map((row) => (
        <g key={row.i}>
          <circle cx={x + 5} cy={row.y - 4} r="4.5" fill={row.i === selected ? '#b4f953' : 'none'} stroke="#b4f953" strokeWidth="1.2" />
          <text x={x + 15} y={row.y} fontSize="10.5" fill={row.i === selected ? '#fafafa' : '#a3a3a3'}>
            {row.label}
          </text>
        </g>
      ))}
    </g>
  );
}
