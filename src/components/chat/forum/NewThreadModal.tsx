'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { threadTagChoice } from '@/utils/chat/forum/forum-tags';
import { useTranslations } from 'next-intl';
import { useNewThreadForm } from '@/hooks/chat/forum/useNewThreadForm';
import { MAX_THREAD_TAGS } from '@/constants/chat/forum';
import { NewThreadTagChip } from './NewThreadTagChip';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Button from '@/components/ui/buttons/Button';
import CloseButton from '@/components/ui/buttons/CloseButton';
import Text from '@/components/ui/layout/Text';
import Heading from '@/components/ui/layout/Heading';

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
          <Heading as="h3" variant="panel">{t('chat.forum.new')}</Heading>
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
              {t('chat.forum.tagsCount', { count: selectedTagIds.length, max: MAX_TAGS })}
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {forumTags.map((tag) => (
                <NewThreadTagChip key={tag.id} tag={tag} choice={threadTagChoice(selectedTagIds, tag.id, MAX_TAGS)} onToggle={toggleTag} />
              ))}
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
            {t(submitting ? 'chat.forum.creating' : 'chat.forum.create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
