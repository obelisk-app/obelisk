'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_FORUM_PREFS, type ForumPrefs } from '@/services/chat/forum/forum-prefs';
import { useDismiss } from '@/hooks/common/useDismiss';
import { MenuItem } from '@/components/ui/overlays/menu';
import Text from '@/components/ui/layout/Text';
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
          <MenuSection title={t('chat.forum.sortBy')}>
            <RadioRow
              label={t('chat.forum.sortActive')}
              checked={prefs.sortBy === 'recent'}
              onClick={() => onChange({ sortBy: 'recent' })}
              testId="forum-sort-recent"
            />
            <RadioRow
              label={t('chat.forum.sortCreated')}
              checked={prefs.sortBy === 'created'}
              onClick={() => onChange({ sortBy: 'created' })}
              testId="forum-sort-created"
            />
          </MenuSection>
          <MenuSection title={t('chat.forum.viewAs')}>
            <RadioRow
              label={t('chat.forum.viewList')}
              checked={prefs.viewMode === 'list'}
              onClick={() => onChange({ viewMode: 'list' })}
              testId="forum-view-list"
            />
            <RadioRow
              label={t('chat.forum.viewGallery')}
              checked={prefs.viewMode === 'gallery'}
              onClick={() => onChange({ viewMode: 'gallery' })}
              testId="forum-view-gallery"
            />
          </MenuSection>
          <MenuSection title={t('chat.forum.tagMatching')}>
            <RadioRow
              label={t('chat.forum.matchAny')}
              checked={prefs.tagMatch === 'any'}
              onClick={() => onChange({ tagMatch: 'any' })}
              testId="forum-match-any"
            />
            <RadioRow
              label={t('chat.forum.matchAll')}
              checked={prefs.tagMatch === 'all'}
              onClick={() => onChange({ tagMatch: 'all' })}
              testId="forum-match-all"
            />
          </MenuSection>
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

function MenuSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Text as="div" size="10" variant="label" tone="muted">{title}</Text>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RadioRow({
  label,
  checked,
  onClick,
  testId,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  testId?: string;
}) {
  // A plain object, so the `data-checked` marker the tests and styles read
  // can ride along with the ARIA state.
  const state = { 'aria-checked': checked, 'data-checked': checked ? 'true' : 'false' };
  return (
    <MenuItem
      role="menuitemradio"
      label={label}
      onClick={onClick}
      testId={testId}
      buttonProps={state}
      trailing={
        <span
          className={
            'h-3.5 w-3.5 rounded-full border-2 shrink-0 ' +
            (checked ? 'border-lc-green bg-lc-green' : 'border-lc-border')
          }
        />
      }
    />
  );
}
