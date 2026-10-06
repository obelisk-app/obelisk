import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { retier, serializeRoles } from '@/components/admin/relay-roles/role-draft';
import {
  DEFAULT_ROLE_COLOR,
  MAX_ROLES,
  normalizeRoleId,
  publishRoleCatalog,
  publishRoleHolders,
  sortRoles,
  type RelayRole,
  type RelayRoles,
} from '@/services/relay-roles';

/**
 * The editable role catalog behind RelayRolesAdminModal: the draft ladder,
 * whether it differs from what the relay holds, and the add / edit / move /
 * delete / save / grant / revoke actions with their status line.
 */
export function useRelayRolesDraft(relayUrl: string, roles: RelayRoles) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<RelayRole[]>(() => sortRoles(roles.roles));
  const [newName, setNewName] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const savedIds = useMemo(() => new Set(roles.roles.map((role) => role.id)), [roles.roles]);

  const savedKey = useMemo(() => serializeRoles(sortRoles(roles.roles)), [roles.roles]);
  const [baseKey, setBaseKey] = useState(savedKey);
  // The catalog usually lands after this modal opens. Seeding the draft only at
  // mount left it empty against a relay that had roles, which read as an edit,
  // so Save lit up and publishing it would have wiped the catalog. Adopt each
  // new catalog while the draft is untouched, and never clobber real edits.
  if (savedKey !== baseKey) {
    setBaseKey(savedKey);
    if (serializeRoles(draft) === baseKey) setDraft(sortRoles(roles.roles));
  }

  // Compare what Save would actually publish: re-tiering is applied on the way
  // out, so a reorder back to the original order is not a change.
  const dirty = serializeRoles(retier(draft)) !== savedKey;

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(label);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not reach the relay.');
    } finally {
      setBusy(false);
    }
  };

  const addRole = () => {
    const name = newName.trim().slice(0, 32);
    const id = normalizeRoleId(name);
    if (!id) return setMessage('Give the role a name with at least one letter or number.');
    if (draft.some((role) => role.id === id)) return setMessage(`“${name}” already exists.`);
    if (draft.length >= MAX_ROLES) return setMessage(`A relay can define up to ${MAX_ROLES} roles.`);
    // New roles start at the bottom of the ladder; the operator moves them up.
    setDraft(retier([...draft, { id, name, tier: 0, color: DEFAULT_ROLE_COLOR, emoji: '' }]));
    setNewName('');
    setMessage(null);
  };

  const updateRole = (id: string, patch: Partial<Pick<RelayRole, 'name' | 'color' | 'emoji'>>) => {
    setDraft(draft.map((value) => (value.id === id ? { ...value, ...patch } : value)));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft(retier(next));
  };

  const removeRole = async (role: RelayRole) => {
    if (savedIds.has(role.id)) {
      const ok = await confirmDialog({
        title: t('roles.confirmDelete').replace('{name}', role.name),
        message: t('roles.confirmDeleteBody'),
        confirmLabel: t('confirm.delete'),
      });
      if (!ok) return;
    }
    setDraft(retier(draft.filter((value) => value.id !== role.id)));
    if (expanded === role.id) setExpanded(null);
  };

  const saveRoles = () => run('Roles saved.', async () => {
    await publishRoleCatalog(relayUrl, retier(draft));
  });

  const grant = (role: RelayRole, pubkey: string) => run(`Granted “${role.name}”.`, async () => {
    const current = roles.holders[role.id] ?? [];
    if (current.includes(pubkey)) return;
    await publishRoleHolders(relayUrl, role.id, [...current, pubkey]);
  });

  const revoke = (role: RelayRole, pubkey: string) => run(`Revoked “${role.name}”.`, async () => {
    await publishRoleHolders(relayUrl, role.id, (roles.holders[role.id] ?? []).filter((value) => value !== pubkey));
  });

  const toggleExpanded = (id: string) => setExpanded(expanded === id ? null : id);

  return {
    draft,
    newName,
    setNewName,
    expanded,
    toggleExpanded,
    busy,
    message,
    setMessage,
    savedIds,
    dirty,
    addRole,
    updateRole,
    move,
    removeRole,
    saveRoles,
    grant,
    revoke,
  };
}

export type RelayRolesDraft = ReturnType<typeof useRelayRolesDraft>;
