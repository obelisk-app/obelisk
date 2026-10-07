'use client';

import Modal from '@/components/ui/overlays/Modal';
import Button from '@/components/ui/buttons/Button';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import EmptyState from '@/components/ui/feedback/EmptyState';
import Input from '@/components/ui/forms/Input';
import { useTranslations } from 'next-intl';
import type { RelayRoles } from '@/services/relay/relay-roles';
import { useRelayRolesDraft } from '@/hooks/admin/relay-roles/useRelayRolesDraft';
import RoleRow from './RoleRow';

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
  const t = useTranslations();
  const draft = useRelayRolesDraft(relayUrl, roles);

  return (
    <Modal
      onClose={onClose}
      testId="relay-roles-modal"
      panelClassName="lc-card mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden bg-lc-dark"
    >
      <ModalHeader title={t('admin.roles.title')} subtitle={t('admin.roles.help')} onClose={onClose} />

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <Input
            value={draft.newName}
            onChange={(event) => draft.setNewName(event.target.value)}
            onKeyDown={(event) => draft.addRoleOnEnter(event.key)}
            placeholder={t('admin.roles.newPlaceholder')}
            aria-label={t('admin.roles.newLabel')}
            maxLength={32}
            className="min-w-[200px] flex-1"
          />
          <Button variant="pillSecondary" size="xs" onClick={draft.addRole}>{t('admin.roles.add')}</Button>
        </div>

        {draft.draft.length === 0 && (
          <EmptyState as="p">{t('admin.roles.empty')}</EmptyState>
        )}

        <ul className="grid gap-2">
          {draft.draft.map((role, index) => (
            <RoleRow key={role.id} role={role} index={index} holders={roles.holders[role.id] ?? []} roles={draft} />
          ))}
        </ul>
      </div>

      {draft.message && <div className="border-t border-lc-border px-5 py-2 text-xs text-lc-green" role="status">{draft.message}</div>}
      <ModalFooter
        meta={t('admin.roles.footer', { count: draft.draft.length })}
        actions={[{
          label: t(draft.busy ? 'admin.roles.saving' : 'admin.roles.save'),
          onClick: () => { void draft.saveRoles(); },
          disabled: draft.busy || !draft.dirty,
        }]}
      />
    </Modal>
  );
}
