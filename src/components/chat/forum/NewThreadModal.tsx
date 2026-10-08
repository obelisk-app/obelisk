'use client';

import { useMyPubkey, useSignerReady, type JsForumTag } from '@/services/nostr-bridge';
import { newThreadForm } from '@/services/chat/forum/new-thread-form';
import { threadTagChoice, toggleThreadTag } from '@/utils/chat/forum/forum-tags';
import { useTranslations } from 'next-intl';
import { useForm } from '@/hooks/common/useForm';
import { MAX_THREAD_TAGS } from '@/constants/chat/forum';
import { NewThreadTagChip } from './NewThreadTagChip';
import Form from '@/components/ui/forms/Form';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import Text from '@/components/ui/layout/Text';

/** The desktop new-publication dialog: title, first message and topic tags, over `newThreadForm`. */
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
  const signerReady = useSignerReady();
  const myPubkey = useMyPubkey();
  const form = useForm(newThreadForm({
    forumGroupId, access: { isPublic, isHidden, isRestricted, isOpen }, initialTitle, signerReady, myPubkey, onCreated,
  }));
  const { tagIds } = form.values;

  return (
    <Modal
      onClose={onClose}
      testId="new-thread-modal"
      panelClassName="lc-card mx-4 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden"
    >
      <ModalHeader title={t('chat.forum.new')} onClose={onClose} />
      <Form form={form} layout="stack" className="min-h-0 flex-1 overflow-y-auto p-4" error={form.error}>
        <Input
          autoFocus
          type="text"
          {...form.field('title')}
          placeholder={t('chat.forum.titlePlaceholder')}
          aria-label={t('chat.forum.titleLabel')}
          maxLength={140}
          data-testid="new-thread-title"
        />
        <TextArea
          {...form.field('body')}
          placeholder={t('chat.forum.firstMessagePlaceholder')}
          aria-label={t('mobile.forum.firstMessage')}
          rows={6}
          data-testid="new-thread-body"
        />
        {forumTags.length > 0 && (
          <div className="space-y-1.5" data-testid="new-thread-tag-picker">
            <Text as="div" size="11" variant="label" tone="muted">
              {t('chat.forum.tagsCount', { count: tagIds.length, max: MAX_THREAD_TAGS })}
            </Text>
            <div className="flex flex-wrap gap-1.5">
              {forumTags.map((tag) => (
                <NewThreadTagChip
                  key={tag.id}
                  tag={tag}
                  choice={threadTagChoice(tagIds, tag.id, MAX_THREAD_TAGS)}
                  onToggle={(id) => form.set('tagIds', toggleThreadTag(tagIds, id, MAX_THREAD_TAGS))}
                />
              ))}
            </div>
          </div>
        )}
      </Form>
      <ModalFooter
        cancel={{ onClick: onClose }}
        actions={[{
          label: t(form.submitting ? 'chat.forum.creating' : 'chat.forum.create'),
          form: form.id,
          disabled: !form.canSubmit,
          testId: 'new-thread-submit',
        }]}
      />
    </Modal>
  );
}
