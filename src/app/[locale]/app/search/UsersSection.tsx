'use client';

import Text from '@/components/ui/layout/Text';
import { useUsersSection } from '@/hooks/shell/search/useUsersSection';
import type { Translate } from '@/i18n/keys';
import { UserResultRow } from './UserResultRow';

/** The people found for the typed query, each opening their profile preview. */
export function UsersSection({ query, t, onPreviewUser }: { query: string; t: Translate; onPreviewUser: (pubkey: string) => void }) {
  const vm = useUsersSection(query);
  return (
    <section data-testid="search-users-section">
      <Text as="div" variant="label" size="11" tone="muted" weight="bold" className="flex items-center justify-between px-3 py-2 border-b border-lc-border">
        <span>{t('shell.search.users')}</span>
        {vm.loading && <Text size="10" tone="muted" className="normal-case font-normal">{t('shell.search.searching')}</Text>}
      </Text>
      {vm.empty && (
        <Text as="div" variant="caption" className="px-3 py-2">{t('shell.search.noMatches')}</Text>
      )}
      {vm.rows.map((r) => (
        <UserResultRow key={r.key} hit={r.hit} badge={r.badge} onPick={() => onPreviewUser(r.hit.pubkey)} />
      ))}
    </section>
  );
}
