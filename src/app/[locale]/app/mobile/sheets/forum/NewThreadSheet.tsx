'use client';

import { useId } from 'react';
import { type JsForumTag } from '@/services/nostr-bridge';
import { MAX_THREAD_TAGS, useNewThreadForm } from '@/hooks/chat/forum/useNewThreadForm';
import { useTranslations } from 'next-intl';
import { NewThreadTagChip } from './NewThreadTagChip';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '../chrome/SheetHeader';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Label from '@/components/ui/forms/Label';

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
  const t = useTranslations();
  const titleId = useId();
  const bodyId = useId();
  const {
    title, body, selectedTagIds, submitting, error, canSubmit,
    setTitle, setBody, toggleTag, submit,
  } = useNewThreadForm(forumGroupId, { isPublic, isHidden, isRestricted, isOpen }, initialTitle, onCreated);
  const MAX_TAGS = MAX_THREAD_TAGS;

  return (
    <Sheet onClose={close} screen="new-thread" label={t('chat.forum.new')} testId="mobile-new-thread-sheet" maxHeight="92%" as="form" onSubmit={(e) => void submit(e)}>
      <SheetHeader title={t('chat.forum.new')} />
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet" htmlFor={titleId}>{t('chat.forum.titleLabel')}</Label>
        <div className="setup-input-wrap">
          <Input
            autoFocus
            variant="mobile"
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('chat.forum.titlePlaceholder')}
            maxLength={140}
            data-testid="mobile-new-thread-title"
          />
        </div>
        <Label variant="sheet" htmlFor={bodyId} style={{ marginTop: 6 }}>{t('mobile.forum.firstMessage')}</Label>
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
            <Label variant="sheet" style={{ marginTop: 6 }}>
              {t('mobile.forum.tagsCount', { count: selectedTagIds.length, max: MAX_TAGS })}
            </Label>
            <div className="forum-filter-row" style={{ flexWrap: 'wrap', overflow: 'visible', margin: 0, padding: 0 }} data-testid="mobile-new-thread-tag-picker">
              {forumTags.map((tag) => (
                <NewThreadTagChip key={tag.id} tag={tag} selectedTagIds={selectedTagIds} max={MAX_TAGS} onToggle={() => toggleTag(tag.id)} />
              ))}
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
          {submitting ? t('mobile.forum.creating') : t('mobile.forum.create')}
        </button>
      </div>
    </Sheet>
  );
}

