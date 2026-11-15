import { useEffect, useState } from 'react';
import type { ConcordCommunity } from '@applesauce/concord/client';
import { useForm } from '@/hooks/common/useForm';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { concordMemberForm } from '@/services/chat/concord/member-form';
import { PERM } from '@/constants/chat/concord';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { banConcordMember } from '@/services/chat/concord/removal';

export function useConcordMember(community: ConcordCommunity, pubkey: string) {
  const author = useAuthor(pubkey);
  const form = useForm(concordMemberForm(community, pubkey));
  const [canManage, setCanManage] = useState(false);
  const [canBan, setCanBan] = useState(false);
  const [state, setState] = useState(community.state$.value);
  const adopt = form.adopt;
  useEffect(() => {
    const permissions = community.canModerate$(pubkey, PERM.MANAGE_ROLES).subscribe(setCanManage);
    const bans = community.canModerate$(pubkey, PERM.BAN).subscribe(setCanBan);
    const subscription = community.state$.subscribe(value => {
      setState(value);
      adopt({ roles: [...(value.grants.get(pubkey) ?? [])] });
    });
    return () => { permissions.unsubscribe(); bans.unsubscribe(); subscription.unsubscribe(); };
  }, [community, pubkey, adopt]);
  const removal = useForm({ initial: { confirmed: false }, ready: values => values.confirmed,
    submit: () => banConcordMember(community, pubkey), failure: 'chat.concord.removalFailed', resetOnSuccess: true });
  return {
    removal, canBan: canBan && !state.channels.some(channel => channel.private),
    form, canManage, name: author.displayName || author.name || shortNpubLabel(pubkey),
    roles: [...state.roles.values()].filter(role => !role.deleted && role.scope.kind === 'server'),
    toggle: (id: string, checked: boolean) => form.set('roles', checked ? [...new Set([...form.values.roles, id])] : form.values.roles.filter(role => role !== id)),
  };
}
