/** A channel member: avatar, name, role badge and the action an admin has on them. */
export default function MemberRow({ y, name, badge, action }: { y: number; name: string; badge: string; action: string }) {
  return (
    <g>
      <circle cx="309" cy={y - 4} r="8" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1.2" />
      <text x="323" y={y} fontSize="11" fontWeight="600" fill="#fafafa">
        {name}
      </text>
      <rect x="356" y={y - 13} width="52" height="16" rx="8" fill="#2d3a1a" />
      <text x="382" y={y - 2} textAnchor="middle" fontSize="9" fontWeight="700" fill="#b4f953">
        {badge}
      </text>
      <rect x="452" y={y - 15} width="64" height="20" rx="10" fill="none" stroke="#b4f953" strokeWidth="1.2" />
      <text x="484" y={y - 1} textAnchor="middle" fontSize="10" fontWeight="600" fill="#b4f953">
        {action}
      </text>
    </g>
  );
}
