'use client';

import { useInterests } from '@/lib/social/useInterests';
import { useTranslation } from '@/i18n/context';
import WidgetCard, { WidgetEmpty } from './WidgetCard';

/**
 * The hashtags this account follows — NIP-51 kind 10015.
 *
 * Reads the same list Amethyst and Primal write, so it is not a local
 * bookmark bar: a tag followed on a phone in another client shows up here.
 */
export default function FollowedTagsWidget({ onOpenTag }: { onOpenTag?: (tag: string) => void }) {
  const { t } = useTranslation();
  const { tags, ready } = useInterests();

  return (
    <WidgetCard title={t('social.followedTags')} testId="widget-followed-tags">
      {!ready ? (
        <div className="space-y-1.5 p-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => <div key={index} className="lc-skeleton h-5 rounded" />)}
        </div>
      ) : (tags ?? []).length === 0 ? (
        <WidgetEmpty testId="followed-tags-empty">{t('social.followedTagsEmpty')}</WidgetEmpty>
      ) : (
        <div className="flex flex-wrap gap-1.5 p-1">
          {(tags ?? []).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onOpenTag?.(tag)}
              className="rounded-full border border-lc-border px-2.5 py-1 text-xs font-medium text-lc-white transition-colors hover:border-lc-green/50 hover:text-lc-green"
              data-testid="followed-tag"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}
