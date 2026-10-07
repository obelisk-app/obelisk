'use client';

import { useTranslations } from 'next-intl';
import type { RelayMenuPanel } from '@/hooks/shell/mobile/sheets/relay/useRelayMenuSheet';
import { RelayMenuRow } from './RelayMenuRow';

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
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>}
        rowLabel={t('mobile.branding.edit')}
        hint={t('mobile.branding.hint')}
        onClick={() => onOpen('branding')}
      />
      <RelayMenuRow
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>}
        rowLabel={t('mobile.settings.packs')}
        hint="NIP-51"
        onClick={() => onOpen('emojis')}
      />
      <RelayMenuRow
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>}
        rowLabel={t('mobile.layout.title')}
        hint={t('mobile.space.layoutHint')}
        onClick={() => onOpen('categories')}
      />
      <RelayMenuRow
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 9.5 8 4 9l4 4-1 6 5-3 5 3-1-6 4-4-5.5-1z" /></svg>}
        rowLabel={t('mobile.space.roles')}
        hint={t('mobile.space.rolesHint')}
        onClick={() => onOpen('roles')}
      />
      <RelayMenuRow
        icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        rowLabel={t('mobile.space.people')}
        hint={t('mobile.space.peopleHint')}
        onClick={() => onOpen('members')}
      />
    </>
  );
}
