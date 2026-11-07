'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import Text from '@/components/ui/layout/Text';
import Input from '@/components/ui/forms/Input';
import { useNostrUserPicker } from '@/hooks/identity/useNostrUserPicker';
import NostrUserPickerRow from './NostrUserPickerRow';

/** Name or Nostr identity search shared by desktop and phone member forms. */
export default function NostrUserPicker({ value, onChange, excludedPubkeys, id, disabled = false, mobile = false }: {
  value: string;
  onChange: (value: string) => void;
  excludedPubkeys: readonly string[];
  id?: string;
  disabled?: boolean;
  mobile?: boolean;
}) {
  const t = useTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const vm = useNostrUserPicker(value, onChange, excludedPubkeys, rootRef);
  return (
    <div ref={rootRef} className="min-w-0 flex-1">
      <Input
        id={id}
        value={value}
        onChange={(event) => vm.change(event.target.value)}
        onKeyDown={vm.onKeyDown}
        onFocus={vm.focus}
        disabled={disabled}
        variant={mobile ? 'mobile' : 'surface'}
        size="sm"
        placeholder={t('chat.channelSettings.searchPeople')}
        aria-label={id ? undefined : t('chat.channelSettings.searchPeople')}
        aria-controls={vm.searching ? vm.resultsId : undefined}
        status={vm.loading ? 'loading' : 'idle'}
        spellCheck={false}
        autoComplete="off"
      />
      {vm.searching && (
        <div id={vm.resultsId} className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-lc-border bg-lc-dark p-1" aria-busy={vm.loading}>
          {vm.loading ? (
            <Text as="p" role="status" size="xs" tone="muted" className="p-2">{t('chat.channelSettings.searchingPeople')}</Text>
          ) : vm.results.length === 0 ? (
            <Text as="p" role="status" size="xs" tone="muted" className="p-2">{t('chat.channelSettings.noPeople')}</Text>
          ) : vm.results.map((hit, index) => (
            <NostrUserPickerRow key={hit.pubkey} hit={hit} selected={index === vm.selected} onPick={vm.pick} />
          ))}
        </div>
      )}
    </div>
  );
}
