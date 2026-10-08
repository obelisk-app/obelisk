'use client';

import List from '@/components/ui/layout/List';
import Button from '@/components/ui/buttons/Button';
import Input from '@/components/ui/forms/Input';
import Text from '@/components/ui/layout/Text';
import { useTranslations } from 'next-intl';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import type { RelayRole } from '@/services/relay/relay-roles';
import { useRoleMembers } from '@/hooks/admin/relay-roles/useRoleMembers';
import RolePersonRow from './RolePersonRow';
import RoleHolderRow from './RoleHolderRow';

/** The expanded member panel of one role: search relay members, grant, and the current holders to revoke. */
export default function RoleMembers({ role, holders, busy, onGrant, onRevoke, onError }: {
  role: RelayRole;
  holders: readonly string[];
  busy: boolean;
  onGrant: (pubkey: string) => void;
  onRevoke: (pubkey: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations();
  const vm = useRoleMembers({ holders, onGrant, onError });
  return (
    <div className="border-t border-lc-border/60 px-3 pb-3 pt-2" data-testid={`role-members-${role.id}`}>
      <Input
        value={vm.query}
        onChange={(event) => vm.setQuery(event.target.value)}
        onKeyDown={(event) => vm.onQueryKey(event.key)}
        placeholder={t('admin.roles.searchPlaceholder')}
        aria-label={t('admin.roles.grantTo', { role: role.name })}
      />

      {vm.pastedIsNew && (
        <Button variant="outline" tone="accent" size="xs" onClick={vm.grantPasted} disabled={busy} className="mt-2 w-full">
          <span className="flex-1 text-left">{t('admin.roles.grantToStranger', { npub: shortNpubLabel(vm.pasted) })}</span>
        </Button>
      )}

      <div className="mt-2 max-h-56 overflow-y-auto" data-testid={`role-candidates-${role.id}`}>
        <List marker="none" spacing="none" className="grid gap-1">
          {vm.matches.map((person) => (
            <RolePersonRow
              key={person.pubkey}
              person={person}
              busy={busy}
              roleName={role.name}
              onClick={() => vm.grantPerson(person.pubkey)}
            />
          ))}
          {vm.matches.length === 0 && !vm.pastedIsNew && (
            <li className="py-3 text-center text-xs text-lc-muted">
              {t(vm.loadingPeople ? 'admin.roles.loadingMembers' : 'admin.roles.noMembersMatch')}
            </li>
          )}
        </List>
      </div>

      <div className="mt-3 border-t border-lc-border/60 pt-2">
        <Text as="div" variant="label" size="10" weight="semibold" tone="muted" className="mb-1">
          {t('admin.roles.holders', { count: holders.length })}
        </Text>
        <List marker="none" spacing="none" className="grid gap-1">
          {holders.map((pubkey) => (
            <RoleHolderRow key={pubkey} pubkey={pubkey} roleName={role.name} busy={busy} onRevoke={() => onRevoke(pubkey)} />
          ))}
          {holders.length === 0 && <li className="py-2 text-xs text-lc-muted">{t('admin.roles.nobody')}</li>}
        </List>
      </div>
    </div>
  );
}
