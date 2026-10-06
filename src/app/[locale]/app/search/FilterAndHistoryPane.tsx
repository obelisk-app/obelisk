'use client';

import { SearchIcon } from './SearchIcon';
import Button from '@/components/ui/Button';
import type { Translate } from '@/i18n/keys';

/** The dropdown before anything is typed: the grammar as rows, then recent queries. */
export function FilterAndHistoryPane({
  history, t, serverName, onPickFilter, onPickHistory, onClearHistory,
}: {
  history: ReadonlyArray<string>;
  t: Translate;
  serverName: string;
  onPickFilter: (token: string) => void;
  onPickHistory: (q: string) => void;
  onClearHistory: () => void;
}) {
  return (
    <>
      {/*
        Scope, not decoration: this pane is NIP-50 over one relay's channels,
        while the feed's search is the open network. They looked identical.
      */}
      <div className="flex items-center justify-between gap-2 border-b border-lc-border px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-lc-muted">{t('shell.search.filters.title')}</span>
        <span
          className="shrink-0 truncate rounded-full border border-lc-border px-2 py-0.5 text-[10px] font-semibold text-lc-muted"
          data-testid="search-scope-badge"
        >
          {t('shell.search.scopeThisRelay', { server: serverName })}
        </span>
      </div>
      <FilterRow icon="👤" title={t('shell.search.filters.fromUser.title')} hint={t('shell.search.filters.fromUser.example')} onClick={() => onPickFilter('from:')} />
      <FilterRow icon="#" title={t('shell.search.filters.inChannel.title')} hint={t('shell.search.filters.inChannel.example')} onClick={() => onPickFilter('in:')} />
      <FilterRow icon="🔗" title={t('shell.search.filters.has.title')} hint={t('shell.search.filters.has.example')} onClick={() => onPickFilter('has:link')} />
      <FilterRow icon="@" title={t('shell.search.filters.mentions.title')} hint={t('shell.search.filters.mentions.example')} onClick={() => onPickFilter('mentions:')} />
      <FilterRow icon="📅" title={t('shell.search.filters.date.title')} hint={t('shell.search.filters.date.example')} onClick={() => onPickFilter('after:')} />
      {history.length > 0 && (
        <>
          <div className="flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted border-t border-lc-border">
            <span>{t('shell.search.history.title')}</span>
            {/* `-my-1` keeps the header row at its old height around the `p-1` button. */}
            <Button variant="ghost" size="icon" onClick={onClearHistory} className="-my-1" aria-label={t('shell.search.history.clear')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
              </svg>
            </Button>
          </div>
          {history.map((h) => (
            <button
              key={h}
              onClick={() => onPickHistory(h)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lc-white hover:bg-lc-card"
            >
              <span className="text-lc-muted shrink-0"><SearchIcon size={14} /></span>
              <span className="truncate">{h}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}

function FilterRow({ icon, title, hint, onClick }: { icon: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-lc-card">
      <span className="mt-0.5 w-6 text-center text-base text-lc-muted">{icon}</span>
      <span className="flex-1 min-w-0">
        <div className="text-sm text-lc-white">{title}</div>
        <div className="text-xs text-lc-muted">{hint}</div>
      </span>
    </button>
  );
}
