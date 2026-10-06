'use client';

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import { useTranslation } from '@/i18n/context';
import type { RelayRoles } from '@/services/relay-roles';
import { useRelayRolesDraft } from '@/hooks/admin/useRelayRolesDraft';
import RoleRow from './relay-roles/RoleRow';

export { parsePubkeyInput } from './relay-roles/role-draft';

/**
 * Operator-only editor for the relay's role ladder (NIP-78 kind 30078). The
 * draft and its actions live in `useRelayRolesDraft`; each role row, its
 * emoji field and its member panel are in `./relay-roles/`.
 */
export default function RelayRolesAdminModal({
  relayUrl,
  roles,
  onClose,
}: {
  relayUrl: string;
  roles: RelayRoles;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const draft = useRelayRolesDraft(relayUrl, roles);

  return (
    <Modal
      onClose={onClose}
      testId="relay-roles-modal"
      panelClassName="lc-card mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden bg-lc-dark"
    >
      <header className="flex items-start justify-between gap-4 border-b border-lc-border px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-lc-white">{t('roles.title')}</h2>
          <p className="mt-1 text-xs text-lc-muted">
            Ordered most senior first. Members can hold several roles: the top one they hold is the badge
            shown in chat and the member list, until you revoke it.
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            value={draft.newName}
            onChange={(event) => draft.setNewName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') draft.addRole(); }}
            placeholder={t('roles.newPlaceholder')}
            aria-label={t('roles.newLabel')}
            maxLength={32}
            className="min-w-[200px] flex-1"
          />
          <Button variant="pillSecondary" size="xs" onClick={draft.addRole}>{t('roles.add')}</Button>
        </div>

        {draft.draft.length === 0 && (
          <EmptyState as="p">{t('roles.empty')}</EmptyState>
        )}

        <ul className="grid gap-2">
          {draft.draft.map((role, index) => (
            <RoleRow key={role.id} role={role} index={index} holders={roles.holders[role.id] ?? []} roles={draft} />
          ))}
        </ul>
      </div>

      {draft.message && <div className="border-t border-lc-border px-5 py-2 text-xs text-lc-green" role="status">{draft.message}</div>}
      <footer className="flex items-center justify-between gap-3 border-t border-lc-border px-5 py-3">
        <span className="text-xs text-lc-muted">{draft.draft.length} roles {'·'} relay operator only</span>
        <div className="flex gap-2">
          <Button variant="pillSecondary" size="xs" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="pill" size="xs" onClick={() => { void draft.saveRoles(); }} disabled={draft.busy || !draft.dirty}>
            {draft.busy ? 'Saving…' : 'Save roles'}
          </Button>
        </div>
      </footer>
    </Modal>
  );
}
