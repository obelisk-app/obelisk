'use client';

import { useTranslations } from 'next-intl';
import { CloseIcon } from '@/assets/icons';
import CloseButton from '@/components/ui/buttons/CloseButton';
import IconButton from '@/components/ui/buttons/IconButton';
import { MediaPickerSearch } from './MediaPickerSearch';

/** Title and close on the popover, the search field, and a close button on the sheet. */
export function EmojiPickerSearchBar({
  isSheet,
  showClose,
  query,
  onQuery,
  onClose,
}: {
  isSheet: boolean;
  showClose: boolean;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <div className={isSheet ? 'my-2 flex items-center gap-2' : 'border-b border-lc-border p-3'}>
      {!isSheet && (
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-lc-white">{t('chat.emoji.title')}</div>
            <div className="text-[11px] text-lc-muted">{t('chat.emoji.subtitle')}</div>
          </div>
          <CloseButton onClick={onClose} label={t('chat.emoji.close')} title={t('common.close')} />
        </div>
      )}
      <MediaPickerSearch
        autoFocus={!isSheet}
        value={query}
        onChange={onQuery}
        placeholder={t('chat.emoji.search')}
      />
      {isSheet && showClose && (
        <IconButton tone="outline" onClick={onClose} aria-label={t('chat.emoji.close')} title={t('common.close')}>
          <CloseIcon size={18} />
        </IconButton>
      )}
    </div>
  );
}
