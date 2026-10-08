'use client';

import Button from '@/components/ui/buttons/Button';
import type { JsForumTag } from '@/services/nostr-bridge';
import { TAG_PALETTES } from '@/utils/chat/forum/forum-tag-colors';
import { useTagColorPicker } from '@/hooks/chat/forum/useTagColorPicker';
import { useTranslations } from 'next-intl';

/**
 * Swatch button + popover for a publication tag's color.
 *
 * "Auto" clears the override back to `null`, which leaves the color derived
 * from the tag id, so a tag is never uncolored, only un-overridden.
 */
export function TagColorPicker({
  tag,
  onPick,
}: {
  tag: JsForumTag;
  onPick: (color: string | null) => void;
}) {
  const t = useTranslations();
  const {
    current, open, pick, ref, toggle,
  } = useTagColorPicker(tag, onPick);
  return (
    <div className="relative shrink-0" ref={ref}>
      <Button
        variant="bare"
        type="button"
        onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-lc-border bg-lc-dark hover:border-lc-muted"
        style={{ borderColor: current.border }}
        aria-label={t('chat.forum.tagColor', { color: tag.color ? t(`chat.forum.colors.${current.key}`) : t('chat.forum.tagColorAuto') })}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={`forum-tag-color-${tag.id}`}
      >
        <span
          className="h-3.5 w-3.5 rounded-full"
          style={{ background: current.text }}
        />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-lc-border bg-lc-dark p-2 shadow-xl"
          data-testid={`forum-tag-color-menu-${tag.id}`}
        >
          <div className="grid grid-cols-5 gap-1.5">
            {TAG_PALETTES.map((p) => (
              <Button
                variant="bare"
                key={p.key}
                type="button"
                onClick={() => pick(p.key)}
                title={t(`chat.forum.colors.${p.key}`)}
                aria-label={t(`chat.forum.colors.${p.key}`)}
                aria-pressed={tag.color === p.key}
                className={
                  'flex h-6 w-6 items-center justify-center rounded-full border transition-transform hover:scale-110 ' +
                  (tag.color === p.key ? 'border-lc-white' : 'border-transparent')
                }
                style={{ background: p.text }}
                data-testid={`forum-tag-color-opt-${p.key}`}
              />
            ))}
          </div>
          <Button
            variant="bare"
            type="button"
            onClick={() => pick(null)}
            className={
              'mt-2 w-full rounded-md px-2 py-1 text-left text-[11px] hover:bg-lc-card ' +
              (tag.color === null ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white')
            }
            data-testid={`forum-tag-color-auto-${tag.id}`}
          >
            {t(tag.color === null ? 'chat.forum.autoInUse' : 'chat.forum.auto')}
          </Button>
        </div>
      )}
    </div>
  );
}
