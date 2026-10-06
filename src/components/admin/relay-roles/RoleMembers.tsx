'use client';

import { useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Text from '@/components/ui/Text';
import UserAvatar from '@/components/ui/UserAvatar';
import { useTranslation } from '@/i18n/context';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useRelayPeople, useUserMetadata, type JsMemberInfo } from '@/services/nostr-bridge';
import type { RelayRole } from '@/services/relay-roles';
import { parsePubkeyInput } from '@/utils/identity/parse-pubkey';

/** The expanded member panel of one role: search relay members, grant, and the current holders to revoke. */
export default function RoleMembers({ role, holders, busy, onGrant, onRevoke, onError }: {
  role: RelayRole;
  holders: readonly string[];
  busy: boolean;
  onGrant: (pubkey: string) => void;
  onRevoke: (pubkey: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const people = useRelayPeople();
  const held = useMemo(() => new Set(holders), [holders]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = people.filter((person) => !held.has(person.pubkey));
    if (!q) return pool.slice(0, 40);
    return pool
      .filter((person) => `${person.displayName} ${person.nip05 ?? ''} ${person.pubkey}`.toLowerCase().includes(q))
      .slice(0, 40);
  }, [held, people, query]);

  // A pubkey pasted for someone the relay has never seen still has to work.
  const pasted = parsePubkeyInput(query);
  const pastedIsNew = !!pasted && !held.has(pasted) && !matches.some((person) => person.pubkey === pasted);

  const grantPasted = () => {
    if (!pasted) {
      onError('No match: search by name, or paste an npub or hex pubkey.');
      return;
    }
    onGrant(pasted);
    setQuery('');
  };

  return (
    <div className="border-t border-lc-border/60 px-3 pb-3 pt-2" data-testid={`role-members-${role.id}`}>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && pastedIsNew) grantPasted(); }}
        placeholder={t('roles.searchPlaceholder')}
        aria-label={`Grant ${role.name} to`}
      />

      {pastedIsNew && (
        <Button variant="outline" tone="accent" size="xs" onClick={grantPasted} disabled={busy} className="mt-2 w-full">
          <span className="flex-1 text-left">Grant to {shortNpubLabel(pasted)}, not a member of this relay yet</span>
        </Button>
      )}

      <div className="mt-2 max-h-56 overflow-y-auto" data-testid={`role-candidates-${role.id}`}>
        <ul className="grid gap-1">
          {matches.map((person) => (
            <RolePersonRow
              key={person.pubkey}
              person={person}
              busy={busy}
              roleName={role.name}
              onClick={() => { onGrant(person.pubkey); setQuery(''); }}
            />
          ))}
          {matches.length === 0 && !pastedIsNew && (
            <li className="py-3 text-center text-xs text-lc-muted">
              {people.length === 0 ? 'Loading relay members…' : 'No members match that search.'}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-3 border-t border-lc-border/60 pt-2">
        <Text as="div" variant="label" size="10" weight="semibold" tone="muted" className="mb-1">
          Holds this role: {holders.length}
        </Text>
        <ul className="grid gap-1">
          {holders.map((pubkey) => (
            <RoleHolderRow key={pubkey} pubkey={pubkey} roleName={role.name} busy={busy} onRevoke={() => onRevoke(pubkey)} />
          ))}
          {holders.length === 0 && <li className="py-2 text-xs text-lc-muted">{t('roles.nobody')}</li>}
        </ul>
      </div>
    </div>
  );
}

function RolePersonRow({ person, busy, roleName, onClick }: {
  person: JsMemberInfo;
  busy: boolean;
  roleName: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={`Grant ${roleName} to ${person.displayName}`}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-lc-card disabled:opacity-40"
      >
        <UserAvatar
          pubkey={person.pubkey}
          picture={person.picture}
          size={7}
          name={person.displayName}
          initials="two"
          initialClassName="text-[10px]"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-lc-white">{person.displayName}</span>
          <span className="block truncate text-[10px] text-lc-muted">{person.nip05 ?? shortNpubLabel(person.pubkey)}</span>
        </span>
        {person.role === 'admin' && (
          <span className="shrink-0 rounded-full bg-lc-green/15 px-1.5 py-px text-[9px] font-bold uppercase text-lc-green">admin</span>
        )}
        <span className="shrink-0 text-xs font-semibold text-lc-green">{t('roles.grant')}</span>
      </button>
    </li>
  );
}

function RoleHolderRow({ pubkey, roleName, busy, onRevoke }: {
  pubkey: string;
  roleName: string;
  busy: boolean;
  onRevoke: () => void;
}) {
  const { t } = useTranslation();
  const meta = useUserMetadata(pubkey);
  const named = meta?.displayName || meta?.name;
  const npub = shortNpubLabel(pubkey);
  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-lc-card">
      <span className="min-w-0 flex-1 truncate text-sm text-lc-white">
        {named || npub}
      </span>
      {/* Keys are never labels: the disambiguator is the short npub, and only beside a real name. */}
      {named && <span className="hidden truncate font-mono text-[10px] text-lc-muted sm:block">{npub}</span>}
      <Button
        variant="outline"
        tone="danger"
        size="xs"
        onClick={onRevoke}
        disabled={busy}
        aria-label={`Revoke ${roleName} from ${npub}`}
      >
        {t('roles.revoke')}
      </Button>
    </li>
  );
}
