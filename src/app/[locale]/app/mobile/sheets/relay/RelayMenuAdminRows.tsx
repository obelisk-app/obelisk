'use client';

import { useTranslations } from 'next-intl';
import type { RelayMenuPanel } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';
import { RelayMenuRow } from './RelayMenuRow';
import { ImageIcon, MenuIcon, SmileIcon, StarSimpleIcon, UsersIcon } from '@/assets/icons';

/** The relay operator's part of the relay menu: one row per admin panel. */
export function RelayMenuAdminRows({ onOpen }: { onOpen: (panel: RelayMenuPanel) => void }) {
  const t = useTranslations();
  return (
    <>
      <div
        data-testid="mobile-relay-admin-section"
        style={{
          marginTop: 6,
          padding: '0 4px',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--app-text-mute)',
        }}
      >
        {t('mobile.members.admin')}
      </div>
      <RelayMenuRow
        icon={<ImageIcon size={20} strokeWidth={1.6} />}
        rowLabel={t('mobile.branding.edit')}
        hint={t('mobile.branding.hint')}
        onClick={() => onOpen('branding')}
      />
      <RelayMenuRow
        icon={<SmileIcon size={20} strokeWidth={1.6} />}
        rowLabel={t('mobile.settings.packs')}
        hint="NIP-51"
        onClick={() => onOpen('emojis')}
      />
      <RelayMenuRow
        icon={<MenuIcon size={20} strokeWidth={1.6} />}
        rowLabel={t('mobile.layout.title')}
        hint={t('mobile.space.layoutHint')}
        onClick={() => onOpen('categories')}
      />
      <RelayMenuRow
        icon={<StarSimpleIcon size={20} strokeWidth={1.6} />}
        rowLabel={t('mobile.space.roles')}
        hint={t('mobile.space.rolesHint')}
        onClick={() => onOpen('roles')}
      />
      <RelayMenuRow
        icon={<UsersIcon size={20} strokeWidth={1.6} />}
        rowLabel={t('mobile.space.people')}
        hint={t('mobile.space.peopleHint')}
        onClick={() => onOpen('members')}
      />
    </>
  );
}
