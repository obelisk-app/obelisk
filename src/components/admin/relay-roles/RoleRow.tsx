'use client';

import Button from '@/components/ui/Button';
import { ChevronDownIcon, ChevronUpIcon } from '@/components/ui/icons';
import Input from '@/components/ui/Input';
import { useTranslation } from '@/i18n/context';
import { normalizeRoleColor, type RelayRole } from '@/services/relay-roles';
import type { RelayRolesDraft } from '@/hooks/admin/useRelayRolesDraft';
import RoleEmojiField from './RoleEmojiField';
import RoleMembers from './RoleMembers';

function MembersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M17 11h4M19 9v4" />
    </svg>
  );
}

/** One role on the ladder: tier, emoji, name, colour, reorder, members toggle, delete, and the members panel. */
export default function RoleRow({ role, index, holders, roles }: {
  role: RelayRole;
  index: number;
  holders: readonly string[];
  roles: RelayRolesDraft;
}) {
  const { t } = useTranslation();
  const saved = roles.savedIds.has(role.id);
  const open = roles.expanded === role.id;
  return (
    <li data-testid={`role-row-${role.id}`} className="rounded-xl border border-lc-border bg-lc-black/40">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="text-[10px] font-mono text-lc-muted" title={t('roles.tier')}>T{role.tier}</span>
        <RoleEmojiField role={role} onPick={(emoji) => roles.updateRole(role.id, { emoji })} />
        <Input
          value={role.name}
          onChange={(event) => roles.updateRole(role.id, { name: event.target.value.slice(0, 32) })}
          aria-label={`${role.id} name`}
          className="min-w-[120px] flex-1"
        />
        <Input
          variant="bare"
          type="color"
          value={normalizeRoleColor(role.color)}
          onChange={(event) => roles.updateRole(role.id, { color: normalizeRoleColor(event.target.value) })}
          aria-label={`${role.id} color`}
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-lc-border bg-lc-black"
        />
        <Button variant="outline" size="xs" onClick={() => roles.move(index, -1)} disabled={index === 0} aria-label={`Move ${role.name} up`}>
          <ChevronUpIcon size={14} />
        </Button>
        <Button variant="outline" size="xs" onClick={() => roles.move(index, 1)} disabled={index === roles.draft.length - 1} aria-label={`Move ${role.name} down`}>
          <ChevronDownIcon size={14} />
        </Button>
        <Button
          variant="outline"
          tone="accent"
          size="xs"
          onClick={() => roles.toggleExpanded(role.id)}
          disabled={!saved}
          aria-expanded={open}
          title={saved ? undefined : 'Save roles before assigning members.'}
        >
          <MembersIcon />
          {holders.length} members
        </Button>
        <Button variant="outline" tone="danger" size="xs" onClick={() => { void roles.removeRole(role); }} aria-label={`Delete ${role.name}`}>
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
