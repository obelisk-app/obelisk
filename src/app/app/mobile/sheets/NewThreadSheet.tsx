'use client';

import { useId } from 'react';
import { type JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/forum-tag-colors';
import { MAX_THREAD_TAGS, useNewThreadForm } from '@/hooks/chat/useNewThreadForm';
import { useTranslation } from '@/i18n/context';
import { MobileTagDot } from '../screens/forum/MobileTagDot';
import Sheet from '@/components/ui/Sheet';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';

export function NewThreadSheet({
  forumGroupId,
  forumTags,
  initialTitle,
  isPublic,
  isHidden,
  isRestricted,
  isOpen,
  close,
  onCreated,
}: {
  forumGroupId: string;
  forumTags: ReadonlyArray<JsForumTag>;
  initialTitle: string;
  isPublic: boolean;
  isHidden: boolean;
  isRestricted: boolean;
  isOpen: boolean;
  close: () => void;
  onCreated: (childId: string) => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const bodyId = useId();
  const {
    title, body, selectedTagIds, submitting, error, canSubmit,
    setTitle, setBody, toggleTag, submit,
  } = useNewThreadForm(forumGroupId, { isPublic, isHidden, isRestricted, isOpen }, initialTitle, onCreated);
  const MAX_TAGS = MAX_THREAD_TAGS;

  return (
    <Sheet onClose={close} screen="new-thread" label={t('forum.new')} testId="mobile-new-thread-sheet" maxHeight="92%" as="form" onSubmit={(e) => void submit(e)}>
      <div className="zap-title">{t('forum.new')}</div>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label htmlFor={titleId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{t('forum.titleLabel')}</label>
        <div className="setup-input-wrap">
          <Input
            autoFocus
            variant="mobile"
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('forum.titlePlaceholder')}
            maxLength={140}
            data-testid="mobile-new-thread-title"
          />
        </div>
        <label htmlFor={bodyId} style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 6 }}>{t('mobile.forum.firstMessage')}</label>
        <TextArea
          variant="mobile"
          id={bodyId}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('mobile.forum.bodyPlaceholder')}
          rows={5}
          data-testid="mobile-new-thread-body"
        />
        {forumTags.length > 0 && (
          <>
            <label style={{ fontSize: 10, color: 'var(--app-text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 6 }}>
              Tags ({selectedTagIds.length}/{MAX_TAGS})
            </label>
            <div className="forum-filter-row" style={{ flexWrap: 'wrap', overflow: 'visible', margin: 0, padding: 0 }} data-testid="mobile-new-thread-tag-picker">
              {forumTags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                const disabled = !active && selectedTagIds.length >= MAX_TAGS;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    disabled={disabled}
                    className="forum-chip"
                    style={{ ...tagChipStyle(tag, active), opacity: disabled ? 0.4 : 1 }}
                    data-testid={`mobile-new-thread-tag-${tag.id}`}
                    aria-pressed={active}
                  >
                    {tag.emoji ? <span>{tag.emoji}</span> : <MobileTagDot tag={tag} />}
                    <span>{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {error && <div style={{ color: '#fca5a5', fontSize: 12 }}>{error}</div>}
      </section>
      <div className="setup-actions" style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={close}
          style={{
            flex: 1,
            padding: '12px',
            borderRadius: 12,
            background: 'transparent',
            border: '1px solid var(--app-line)',
            color: 'var(--app-text-dim)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="forum-new-pill"
          style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
          data-testid="mobile-new-thread-submit"
        >
          {submitting ? 'Creating…' : 'Create'}
        </button>
      </div>
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 14 - message actions sheet (over channel)
