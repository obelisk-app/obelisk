'use client';

import { useTopRole } from '@/hooks/chat/useTopRole';

/**
 * The badge shown next to a user's name: the highest-tier role the user
 * holds, or nothing.
 */
export default function RoleBadge({ pubkey, className }: { pubkey: string; className?: string }) {
  const role = useTopRole(pubkey);
  if (!role) return null;
  return (
    <span
      data-testid="role-badge"
      data-role-id={role.id}
      title={`Role: ${role.emoji ? `${role.emoji} ` : ''}${role.name}`}
      className={'shrink-0 truncate rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase leading-normal tracking-wide ' + (className ?? '')}
      style={{ color: role.color, borderColor: `${role.color}59`, backgroundColor: `${role.color}1f` }}
    >
      {role.emoji && <span className="mr-0.5" aria-hidden="true">{role.emoji}</span>}
      {role.name}
    </span>
  );
}
