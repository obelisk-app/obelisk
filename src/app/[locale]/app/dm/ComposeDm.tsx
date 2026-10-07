'use client';

/**
 * "New message" on desktop: type a name, a NIP-05 or an npub and pick a
 * person from live results.
 *
 * It used to be a bare text box with Cancel / Start buttons that only
 * understood a pasted npub, hex key or exact NIP-05 - no names, no results, no
 * way to see who you were about to message. It now runs the same people
 * search the rest of the app uses (`useNostrUserSearch`: NIP-19 decode, NIP-05
 * resolution and NIP-50 name search on the index relays), and picking a
 * result opens the thread. Keyboard: ↑/↓ to move, Enter to open, Esc to close.
 */

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useComposeDm } from '@/hooks/shell/dm/useComposeDm';
import Input from '@/components/ui/forms/Input';
import CloseButton from '@/components/ui/buttons/CloseButton';
import { ComposeDmResultRow } from './ComposeDmResultRow';
import { SearchIcon } from '@/assets/icons';
import Text from '@/components/ui/layout/Text';

export default function ComposeDm({
  onClose,
  onPicked,
}: {
  onClose: () => void;
  onPicked: (pubkeyHex: string) => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const vm = useComposeDm({ onClose, onPicked, inputRef });

  return (
    <div className="border-b border-lc-border bg-lc-card/30 p-3" data-testid="dm-composer-search">
      <div className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2.5 focus-within:border-lc-green">
        <SearchIcon size={14} strokeWidth={2} className="shrink-0 text-lc-muted" />
        <Input
          variant="bare"
          ref={inputRef}
          value={vm.query}
          onChange={(e) => vm.setQuery(e.target.value)}
          onKeyDown={vm.onKeyDown}
          placeholder={t('dm.compose.placeholder')}
          spellCheck={false}
          autoComplete="off"
          role="combobox"
          aria-expanded={vm.results.length > 0}
          aria-controls="dm-compose-results"
          aria-label={t('dm.newMessage')}
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-lc-white outline-none placeholder:text-lc-muted"
          data-testid="dm-compose-input"
        />
        {vm.loading && <span className="lc-spinner h-3.5 w-3.5 shrink-0" role="status" aria-label={t('shell.search.searching')} />}
        <CloseButton
          size="sm"
          onClick={onClose}
          label={t('shell.search.close')}
          title={t('shell.search.close')}
          className="text-lc-white/70 hover:bg-white/5"
        />
      </div>
      {vm.searching && (
        <div id="dm-compose-results" role="listbox" className="mt-2 max-h-72 space-y-0.5 overflow-y-auto">
          {vm.results.map((hit, i) => (
            <ComposeDmResultRow
              key={hit.pubkey}
              hit={hit}
              active={i === vm.selected}
              onPick={() => vm.pick(hit.pubkey)}
              onHover={() => vm.highlight(i)}
            />
          ))}
          {vm.results.length === 0 && (
            <Text as="p" variant="caption" className="px-2 py-1.5" role="status">
              {vm.loading ? t('shell.search.searching') : t('shell.search.noMatches')}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
