'use client';

import { useUsersSection } from '@/hooks/shell/search/useUsersSection';
import type { Translate } from '@/i18n/keys';
import { UserResultRow } from './UserResultRow';

/** The people found for the typed query, each opening their profile preview. */
export function UsersSection({ query, t, onPreviewUser }: { query: string; t: Translate; onPreviewUser: (pubkey: string) => void }) {
  const vm = useUsersSection(query);
  return (
    <section data-testid="search-users-section">
      <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-b border-lc-border">
        <span>{t('shell.search.users')}</span>
        {vm.loading && <span className="text-[10px] normal-case font-normal text-lc-muted">{t('shell.search.searching')}</span>}
      </div>
      {vm.empty && (
        <div className="px-3 py-2 text-xs text-lc-muted">{t('shell.search.noMatches')}</div>
      )}
      {vm.rows.map((r) => (
        <UserResultRow key={r.key} hit={r.hit} badge={r.badge} onPick={() => onPreviewUser(r.hit.pubkey)} />
      ))}
    </section>
  );
}
