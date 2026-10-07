'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRelayPeople } from '@/services/nostr-bridge';
import { parsePubkeyInput } from '@/utils/identity/parse-pubkey';
import { isNewPastedHolder, roleCandidates } from '@/utils/admin/relay-roles-members';

/**
 * The member panel of one role: the search, the relay members it matches
 * (holders left out), a pasted pubkey for someone the relay has never seen,
 * and granting to either.
 */
export function useRoleMembers({ holders, onGrant, onError }: {
  holders: readonly string[];
  onGrant: (pubkey: string) => void;
  onError: (message: string) => void;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const people = useRelayPeople();
  const held = useMemo(() => new Set(holders), [holders]);
  const matches = useMemo(() => roleCandidates(people, held, query), [held, people, query]);
  const pasted = parsePubkeyInput(query);
  const pastedIsNew = isNewPastedHolder(pasted, held, matches);

  const grantPasted = () => {
    if (!pasted) {
      onError(t('admin.roles.noMatch'));
      return;
    }
    onGrant(pasted);
    setQuery('');
  };

  const grantPerson = (pubkey: string) => {
    onGrant(pubkey);
    setQuery('');
  };

  const onQueryKey = (key: string) => {
    if (key === 'Enter' && pastedIsNew) grantPasted();
  };

  return {
    query,
    setQuery,
    matches,
    /** The pasted pubkey, or '' when the search is not one; shown only while `pastedIsNew`. */
    pasted: pasted ?? '',
    pastedIsNew,
    /** Nothing to show yet because the relay's people have not arrived. */
    loadingPeople: people.length === 0,
    grantPasted,
    grantPerson,
    onQueryKey,
  };
}
