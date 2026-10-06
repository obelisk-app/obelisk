'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { tagChipStyle } from '@/utils/forum-tag-colors';
import { useTranslations } from 'next-intl';
import { MAX_THREAD_TAGS, useNewThreadForm } from '@/hooks/chat/useNewThreadForm';
import { TagDot } from './TagDot';
import Input from '@/components/ui/Input';
import TextArea from '@/components/ui/TextArea';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import Text from '@/components/ui/Text';

export function NewThreadModal({
  forumGroupId,
  forumTags,
  initialTitle,
  isPublic,
  isHidden,
  isRestricted,
  isOpen,
  onClose,
  onCreated,
}: {
  forumGroupId: string;
  forumTags: ReadonlyArray<JsForumTag>;
  initialTitle: string;
  isPublic: boolean;
  isHidden: boolean;
  isRestricted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (childId: string) => void;
}) {
  const t = useTranslations();
  const {
    title, body, selectedTagIds, submitting, error, canSubmit,
    setTitle, setBody, toggleTag, submit,
  } = useNewThreadForm(forumGroupId, { isPublic, isHidden, isRestricted, isOpen }, initialTitle, onCreated);
  const MAX_TAGS = MAX_THREAD_TAGS;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="new-thread-modal"
    >
      <form
        onSubmit={(e) => void submit(e)}
        onClick={(e) => e.stopPropagation()}
        className="lc-card w-full max-w-xl max-h-[85vh] overflow-y-auto p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-lc-white">{t('chat.forum.new')}</h3>
          <CloseButton onClick={onClose} />
        </div>
        <Input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('chat.forum.titlePlaceholder')}
          aria-label={t('chat.forum.titleLabel')}
          maxLength={140}
          data-testid="new-thread-title"
        />
        <TextArea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('chat.forum.firstMessagePlaceholder')}
          aria-label={t('mobile.forum.firstMessage')}
          rows={6}
          data-testid="new-thread-body"
        />
        {forumTags.length > 0 && (
          <div className="space-y-1.5" data-testid="new-thread-tag-picker">
            <Text as="div" size="11" variant="label" tone="muted">
              Tags ({selectedTagIds.length}/{MAX_TAGS})
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {forumTags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                const disabled = !active && selectedTagIds.length >= MAX_TAGS;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    disabled={disabled}
                    style={tagChipStyle(tag, active)}
                    className="rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    data-testid={`new-thread-tag-${tag.id}`}
                    aria-pressed={active}
                  >
                    {tag.emoji
                      ? <span className="text-sm leading-none">{tag.emoji}</span>
                      : <TagDot tag={tag} />}
                    <span className="truncate max-w-[10rem]">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button variant="pillSecondary" size="xs" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="pill"
            size="xs"
            disabled={!canSubmit}
            data-testid="new-thread-submit"
          >
            {submitting ? 'Creating…' : 'Create publication'}
          </Button>
        </div>
      </form>
    </div>
  );
}
