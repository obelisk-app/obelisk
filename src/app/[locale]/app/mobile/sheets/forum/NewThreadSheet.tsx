'use client';

import { useId } from 'react';
import { type JsForumTag } from '@/services/nostr-bridge';
import { useMyPubkey, useSignerReady } from '@/hooks/session/useSession';
import { newThreadForm } from '@/services/chat/forum/new-thread-form';
import { toggleThreadTag } from '@/utils/chat/forum/forum-tags';
import { useForm } from '@/hooks/common/useForm';
import { MAX_THREAD_TAGS } from '@/constants/chat/forum';
import { useTranslations } from 'next-intl';
import { NewThreadTagChip } from './NewThreadTagChip';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/components/ui/overlays/SheetHeader';
import SheetActions from '@/components/ui/overlays/SheetActions';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';
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
  const signerReady = useSignerReady();
  const myPubkey = useMyPubkey();
  const form = useForm(newThreadForm({
    forumGroupId, access: { isPublic, isHidden, isRestricted, isOpen }, initialTitle, signerReady, myPubkey, onCreated,
  }));
  const { tagIds } = form.values;

  return (
    <Sheet onClose={close} screen="new-thread" label={t('chat.forum.new')} testId="mobile-new-thread-sheet" maxHeight="92%">
      <SheetHeader title={t('chat.forum.new')} />
      <Form form={form} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label variant="sheet" htmlFor={titleId}>{t('chat.forum.titleLabel')}</Label>
        <div className="setup-input-wrap">
          <Input
            autoFocus
            variant="mobile"
            id={titleId}
            {...form.field('title')}
            placeholder={t('chat.forum.titlePlaceholder')}
            maxLength={140}
            data-testid="mobile-new-thread-title"
          />
        </div>
        <Label variant="sheet" htmlFor={bodyId} style={{ marginTop: 6 }}>{t('mobile.forum.firstMessage')}</Label>
        <TextArea
          variant="mobile"
          id={bodyId}
          {...form.field('body')}
          placeholder={t('mobile.forum.bodyPlaceholder')}
          rows={5}
          data-testid="mobile-new-thread-body"
        />
        {forumTags.length > 0 && (
          <>
            <Label variant="sheet" style={{ marginTop: 6 }}>
              {t('mobile.forum.tagsCount', { count: tagIds.length, max: MAX_THREAD_TAGS })}
            </Label>
            <div className="forum-filter-row" style={{ flexWrap: 'wrap', overflow: 'visible', margin: 0, padding: 0 }} data-testid="mobile-new-thread-tag-picker">
              {forumTags.map((tag) => (
                <NewThreadTagChip
                  key={tag.id}
                  tag={tag}
                  selectedTagIds={tagIds}
                  max={MAX_THREAD_TAGS}
                  onToggle={() => form.set('tagIds', toggleThreadTag(tagIds, tag.id, MAX_THREAD_TAGS))}
                />
              ))}
            </div>
          </>
        )}
        <FormError variant="sheet">{form.error}</FormError>
      </Form>
      <SheetActions
        primary={{
          label: t('mobile.forum.create'),
          busyLabel: t('mobile.forum.creating'),
          busy: form.submitting,
          disabled: !form.canSubmit,
          form: form.id,
          testId: 'mobile-new-thread-submit',
        }}
        onCancel={close}
      />
    </Sheet>
  );
}

