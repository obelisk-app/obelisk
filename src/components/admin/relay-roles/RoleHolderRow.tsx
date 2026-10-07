'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useUserMetadata } from '@/services/nostr-bridge';

/** Someone who holds the role: their name (or short npub) and a revoke button. */
export default function RoleHolderRow({ pubkey, roleName, busy, onRevoke }: {
  pubkey: string;
  roleName: string;
  busy: boolean;
  onRevoke: () => void;
}) {
  const t = useTranslations();
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
        aria-label={t('admin.roles.revokeFrom', { role: roleName, npub })}
      >
        {t('admin.roles.revoke')}
      </Button>
    </li>
  );
}
