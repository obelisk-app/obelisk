'use client';

import type { JsForumTag } from '@/services/nostr-bridge';
import { paletteForTag, tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import Button from '@/components/ui/buttons/Button';
import { CloseIcon } from '@/components/ui/icons/icons';
import { MAX_FORUM_TAGS, removeTagAt, tagEmojiValue, updateTagAt, withNewTag } from '@/utils/chat/forum/forum-tags';
import { TagColorPicker } from './TagColorPicker';

/**
 * Admin editor for a forum container's curated tag set (name, optional
 * emoji, optional colour override). Lived inside DesktopShell, which meant
 * phone admins had no way to curate tags at all; it is one component now,
 * mounted by both channel settings skins when the kind is `forum`.
 */
export default function ForumTagsEditor({
  value,
  onChange,
}: {
  value: ReadonlyArray<JsForumTag>;
  onChange: (next: ReadonlyArray<JsForumTag>) => void;
}) {
  const t = useTranslations();
  const MAX = MAX_FORUM_TAGS;
  const updateAt = (idx: number, patch: Partial<JsForumTag>) => onChange(updateTagAt(value, idx, patch));
  const removeAt = (idx: number) => onChange(removeTagAt(value, idx));
  const addTag = () => {
    const next = withNewTag(value, MAX);
    if (next) onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-lc-border px-3 py-3 text-center text-xs text-lc-muted">
          {t('shell.desktop.tags.empty')}
        </div>
      )}
      {value.map((tag, idx) => (
        <div
          key={tag.id}
          className="flex items-center gap-2 rounded-lg border border-lc-border bg-lc-black px-2 py-1.5"
          data-testid={`forum-tag-row-${tag.id}`}
        >
          <TagColorPicker
            tag={tag}
            onPick={(color) => updateAt(idx, { color })}
          />
          <Input
            size="xs"
            fontSize="sm"
            tone="dark"
            type="text"
            value={tag.emoji ?? ''}
            onChange={(e) => updateAt(idx, { emoji: tagEmojiValue(e.target.value) })}
            placeholder="🌐"
            maxLength={4}
            className="w-12 shrink-0 text-center"
            aria-label={t('shell.desktop.tags.emoji')}
            data-testid={`forum-tag-emoji-${tag.id}`}
          />
          <Input
            size="xs"
            fontSize="sm"
            tone="dark"
            type="text"
            value={tag.name}
            onChange={(e) => updateAt(idx, { name: e.target.value })}
            placeholder={t('shell.desktop.tags.name')}
            maxLength={40}
            className="min-w-0 flex-1"
            aria-label={t('shell.desktop.tags.name')}
            data-testid={`forum-tag-name-${tag.id}`}
          />
          {/* Shows the result rather than describing it: this is exactly how
              the chip renders in the filter row. */}
          {tag.name.trim() && (
            <span
              style={tagChipStyle(tag)}
              className="hidden shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:flex"
              data-testid={`forum-tag-preview-${tag.id}`}
            >
              {tag.emoji ? (
                <span className="leading-none">{tag.emoji}</span>
              ) : (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: paletteForTag(tag).text }}
                />
              )}
              <span className="max-w-[7rem] truncate">{tag.name}</span>
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            tone="danger"
            onClick={() => removeAt(idx)}
            className="shrink-0"
            aria-label={t('shell.desktop.tags.remove')}
            data-testid={`forum-tag-remove-${tag.id}`}
          >
            <CloseIcon size={14} />
          </Button>
        </div>
      ))}
      <Button
        variant="pillSecondary"
        size="xs"
        onClick={addTag}
        disabled={value.length >= MAX}
        data-testid="forum-tag-add"
      >
        {t('chat.forum.addTag')}
      </Button>
      {value.length >= MAX && (
        <p className="text-[11px] text-lc-muted">{t('chat.forum.maxTags', { count: MAX })}</p>
      )}
    </div>
  );
}
