'use client';

import { useTranslation } from '@/i18n/context';
import { CloseIcon } from '@/components/ui/icons';
import CloseButton from '@/components/ui/CloseButton';
import { EMOJI_NAV } from './emoji-sections';
import { MediaPickerSearch } from './MediaPickerSearch';
import { RecentIcon } from './RecentIcon';
import IconButton from '@/components/ui/IconButton';

/** The category bar (hidden while searching). */
export function EmojiCategoryNav({
  activeCategory,
  onJump,
}: {
  activeCategory: string;
  onJump: (category: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav className="mb-2 grid shrink-0 grid-cols-9 border-b border-lc-border px-1 pb-1" aria-label={t('emoji.categories')}>
      {EMOJI_NAV.map((meta) => {
        const category = meta.name;
        return (
          <button
            type="button"
            key={category}
            onClick={() => onJump(category)}
            aria-label={meta.label}
            aria-pressed={activeCategory === category}
            title={meta.label}
            className={['flex h-10 min-w-0 items-center justify-center rounded-lg border-b-2 text-xl', activeCategory === category ? 'border-lc-green bg-lc-green/10' : 'border-transparent hover:bg-lc-border/60'].join(' ')}
          >
            {category === 'Recent' ? <RecentIcon /> : <span aria-hidden="true">{meta.icon}</span>}
          </button>
        );
      })}
    </nav>
  );
}

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
  const { t } = useTranslation();
  return (
    <div className={isSheet ? 'my-2 flex items-center gap-2' : 'border-b border-lc-border p-3'}>
      {!isSheet && (
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-lc-white">{t('emoji.title')}</div>
            <div className="text-[11px] text-lc-muted">{t('emoji.subtitle')}</div>
          </div>
          <CloseButton onClick={onClose} label={t('emoji.close')} title={t('common.close')} />
        </div>
      )}
      <MediaPickerSearch
        autoFocus={!isSheet}
        value={query}
        onChange={onQuery}
        placeholder={t('emoji.search')}
      />
      {isSheet && showClose && (
        <IconButton tone="outline" onClick={onClose} aria-label={t('emoji.close')} title={t('common.close')}>
          <CloseIcon size={18} />
        </IconButton>
      )}
    </div>
  );
}
