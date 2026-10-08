'use client';

import Button from '@/components/ui/buttons/Button';
import UserAvatar from '@/components/ui/media/UserAvatar';
import { useTranslations } from 'next-intl';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import type { JsMemberInfo } from '@/services/nostr-bridge';

/** A relay member the role can be granted to: avatar, name, NIP-05 or short npub, an admin badge. */
export default function RolePersonRow({ person, busy, roleName, onClick }: {
  person: JsMemberInfo;
  busy: boolean;
  roleName: string;
  onClick: () => void;
}) {
  const t = useTranslations();
  return (
    <li>
      <Button
        variant="bare"
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-label={t('admin.roles.grantToPerson', { role: roleName, name: person.displayName })}
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
          <span className="shrink-0 rounded-full bg-lc-green/15 px-1.5 py-px text-[9px] font-bold uppercase text-lc-green">{t('admin.roles.adminBadge')}</span>
        )}
        <span className="shrink-0 text-xs font-semibold text-lc-green">{t('admin.roles.grant')}</span>
      </Button>
    </li>
  );
}
