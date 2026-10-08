'use client';

import Button from '@/components/ui/buttons/Button';
import type { ForumPrefs } from '@/services/chat/forum/forum-prefs';
import { useTranslations } from 'next-intl';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '../chrome/SheetHeader';
import { SortSheetRow } from './SortSheetRow';
import Label from '@/components/ui/forms/Label';

export function ForumSortSheet({
  prefs,
  onChange,
  close,
}: {
  prefs: ForumPrefs;
  onChange: (p: Partial<ForumPrefs>) => void;
  close: () => void;
}) {
  const t = useTranslations();
  return (
    <Sheet onClose={close} screen="forum-sort" label={t('chat.forum.sortTitle')} testId="mobile-forum-sort-sheet">
      <SheetHeader title={t('chat.forum.sortTitle')} />
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet">{t('chat.forum.sortBy')}</Label>
        <SortSheetRow
          label={t('chat.forum.sortActive')}
          checked={prefs.sortBy === 'recent'}
          onClick={() => onChange({ sortBy: 'recent' })}
          testId="mobile-forum-sort-recent"
        />
        <SortSheetRow
          label={t('chat.forum.sortCreated')}
          checked={prefs.sortBy === 'created'}
          onClick={() => onChange({ sortBy: 'created' })}
          testId="mobile-forum-sort-created"
        />
        <Label variant="sheet" style={{ marginTop: 12 }}>{t('chat.forum.tagMatching')}</Label>
        <SortSheetRow
          label={t('chat.forum.matchAny')}
          checked={prefs.tagMatch === 'any'}
          onClick={() => onChange({ tagMatch: 'any' })}
          testId="mobile-forum-match-any"
        />
        <SortSheetRow
          label={t('chat.forum.matchAll')}
          checked={prefs.tagMatch === 'all'}
          onClick={() => onChange({ tagMatch: 'all' })}
          testId="mobile-forum-match-all"
        />
      </section>
      <div className="setup-actions">
        <Button
          variant="bare"
          type="button"
          className="forum-new-pill"
          onClick={close}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {t('common.done')}
        </Button>
      </div>
    </Sheet>
  );
}
