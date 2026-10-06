'use client';

import type { ForumPrefs } from '@/services/forum-prefs';
import { useTranslation } from '@/i18n/context';
import Sheet from '@/components/ui/Sheet';

export function ForumSortSheet({
  prefs,
  onChange,
  close,
}: {
  prefs: ForumPrefs;
  onChange: (p: Partial<ForumPrefs>) => void;
  close: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet onClose={close} screen="forum-sort" label={t('forum.sortTitle')} testId="mobile-forum-sort-sheet">
      <div className="zap-title">{t('forum.sortTitle')}</div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('forum.sortBy')}</label>
        <SortSheetRow
          label={t('forum.sortActive')}
          checked={prefs.sortBy === 'recent'}
          onClick={() => onChange({ sortBy: 'recent' })}
          testId="mobile-forum-sort-recent"
        />
        <SortSheetRow
          label={t('forum.sortCreated')}
          checked={prefs.sortBy === 'created'}
          onClick={() => onChange({ sortBy: 'created' })}
          testId="mobile-forum-sort-created"
        />
        <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 12 }}>{t('forum.tagMatching')}</label>
        <SortSheetRow
          label={t('forum.matchAny')}
          checked={prefs.tagMatch === 'any'}
          onClick={() => onChange({ tagMatch: 'any' })}
          testId="mobile-forum-match-any"
        />
        <SortSheetRow
          label={t('forum.matchAll')}
          checked={prefs.tagMatch === 'all'}
          onClick={() => onChange({ tagMatch: 'all' })}
          testId="mobile-forum-match-all"
        />
      </section>
      <div className="setup-actions">
        <button
          type="button"
          className="forum-new-pill"
          onClick={close}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {t('common.done')}
        </button>
      </div>
    </Sheet>
  );
}

function SortSheetRow({
  label,
  checked,
  onClick,
  testId,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-checked={checked ? 'true' : 'false'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 4px',
        background: 'transparent',
        border: 'none',
        color: 'var(--app-text)',
        fontSize: 14,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span>{label}</span>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `2px solid ${checked ? 'var(--accent)' : 'var(--app-line)'}`,
          background: checked ? 'var(--accent)' : 'transparent',
          flexShrink: 0,
        }}
      />
    </button>
  );
}
