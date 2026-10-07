'use client';

import Button from '@/components/ui/buttons/Button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons/icons';
import Input from '@/components/ui/forms/Input';
import { useTranslations } from 'next-intl';
import { normalizeRoleColor, type RelayRole } from '@/services/relay/relay-roles';
import type { RelayRolesDraft } from '@/hooks/admin/relay-roles/useRelayRolesDraft';
import RoleEmojiField from './RoleEmojiField';
import RoleMembers from './RoleMembers';
import MembersIcon from './MembersIcon';

/** One role on the ladder: tier, emoji, name, colour, reorder, members toggle, delete, and the members panel. */
export default function RoleRow({ role, index, holders, roles }: {
  role: RelayRole;
  index: number;
  holders: readonly string[];
  roles: RelayRolesDraft;
}) {
  const t = useTranslations();
  const saved = roles.savedIds.has(role.id);
  const open = roles.expanded === role.id;
  return (
    <li data-testid={`role-row-${role.id}`} className="rounded-xl border border-lc-border bg-lc-black/40">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-[10px] font-mono text-lc-muted" title={t('admin.roles.tier')}>T{role.tier}</span>
        <RoleEmojiField role={role} onPick={(emoji) => roles.updateRole(role.id, { emoji })} />
        <Input
          value={role.name}
          onChange={(event) => roles.updateRole(role.id, { name: event.target.value.slice(0, 32) })}
          aria-label={t('admin.roles.nameLabel', { role: role.id })}
          className="min-w-[120px] flex-1"
        />
        <Input
          variant="bare"
          type="color"
          value={normalizeRoleColor(role.color)}
          onChange={(event) => roles.updateRole(role.id, { color: normalizeRoleColor(event.target.value) })}
          aria-label={t('admin.roles.colorLabel', { role: role.id })}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-lc-border bg-lc-black"
        />
        <Button variant="outline" size="xs" onClick={() => roles.move(index, -1)} disabled={index === 0} aria-label={t('admin.roles.moveUp', { name: role.name })}>
          <ChevronUpIcon size={14} />
        </Button>
        <Button variant="outline" size="xs" onClick={() => roles.move(index, 1)} disabled={index === roles.draft.length - 1} aria-label={t('admin.roles.moveDown', { name: role.name })}>
          <ChevronDownIcon size={14} />
        </Button>
        <Button
          variant="outline"
          tone="accent"
          size="xs"
          onClick={() => roles.toggleExpanded(role.id)}
          disabled={!saved}
          aria-expanded={open}
          title={saved ? undefined : t('admin.roles.saveFirst')}
        >
          <MembersIcon />
          {t('admin.roles.members', { count: holders.length })}
        </Button>
        <Button variant="outline" tone="danger" size="xs" onClick={() => { void roles.removeRole(role); }} aria-label={t('admin.roles.delete', { name: role.name })}>
          {t('mobile.layout.delete')}
        </Button>
      </div>
      {open && saved && (
        <RoleMembers
          role={role}
          holders={holders}
          busy={roles.busy}
          onGrant={(pubkey) => roles.grant(role, pubkey)}
          onRevoke={(pubkey) => roles.revoke(role, pubkey)}
          onError={roles.setMessage}
        />
      )}
    </li>
  );
}
