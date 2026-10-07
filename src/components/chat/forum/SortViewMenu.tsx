'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_FORUM_PREFS, type ForumPrefs } from '@/services/chat/forum/forum-prefs';
import { useDismiss } from '@/hooks/common/useDismiss';
import { SortViewSection } from './SortViewSection';
import { SortViewRadioRow } from './SortViewRadioRow';
import { ChevronDownIcon, SortIcon } from './forum-icons';
import TextButton from '@/components/ui/buttons/TextButton';
import Button from '@/components/ui/buttons/Button';

/** The "Sort & view" pill and its popover: sort order, list vs gallery, any/all tag matching, reset. */
export function SortViewMenu({
  prefs,
  onChange,
}: {
  prefs: ForumPrefs;
  onChange: (p: Partial<ForumPrefs>) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss({ refs: [ref], onDismiss: close, enabled: open });
  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        variant="outlinePill"
        size="xs"
        onClick={() => setOpen((v) => !v)}
        data-testid="forum-sortview-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SortIcon />
        <span>{t('chat.forum.sortTitle')}</span>
        <ChevronDownIcon />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-30 w-60 rounded-xl border border-lc-border bg-lc-dark p-3 shadow-xl space-y-3"
          data-testid="forum-sortview-menu"
        >
          <SortViewSection title={t('chat.forum.sortBy')}>
            <SortViewRadioRow
              label={t('chat.forum.sortActive')}
              checked={prefs.sortBy === 'recent'}
              onClick={() => onChange({ sortBy: 'recent' })}
              testId="forum-sort-recent"
            />
            <SortViewRadioRow
              label={t('chat.forum.sortCreated')}
              checked={prefs.sortBy === 'created'}
              onClick={() => onChange({ sortBy: 'created' })}
              testId="forum-sort-created"
            />
          </SortViewSection>
          <SortViewSection title={t('chat.forum.viewAs')}>
            <SortViewRadioRow
              label={t('chat.forum.viewList')}
              checked={prefs.viewMode === 'list'}
              onClick={() => onChange({ viewMode: 'list' })}
              testId="forum-view-list"
            />
            <SortViewRadioRow
              label={t('chat.forum.viewGallery')}
              checked={prefs.viewMode === 'gallery'}
              onClick={() => onChange({ viewMode: 'gallery' })}
              testId="forum-view-gallery"
            />
          </SortViewSection>
          <SortViewSection title={t('chat.forum.tagMatching')}>
            <SortViewRadioRow
              label={t('chat.forum.matchAny')}
              checked={prefs.tagMatch === 'any'}
              onClick={() => onChange({ tagMatch: 'any' })}
              testId="forum-match-any"
            />
            <SortViewRadioRow
              label={t('chat.forum.matchAll')}
              checked={prefs.tagMatch === 'all'}
              onClick={() => onChange({ tagMatch: 'all' })}
              testId="forum-match-all"
            />
          </SortViewSection>
          <div className="border-t border-lc-border -mx-3" />
          <TextButton tone="muted"
            onClick={() => onChange(DEFAULT_FORUM_PREFS)} className="text-xs"
            data-testid="forum-sortview-reset"
          >
            {t('chat.forum.reset')}
          </TextButton>
        </div>
      )}
    </div>
  );
}
