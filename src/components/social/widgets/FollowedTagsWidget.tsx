'use client';

import { useInterests } from '@/hooks/social/tags/useInterests';
import { useTranslations } from 'next-intl';
import Panel from '@/components/ui/layout/Panel';
import WidgetEmpty from './WidgetEmpty';
import Button from '@/components/ui/buttons/Button';
import Skeleton from '@/components/ui/animations/Skeleton';

/**
 * The hashtags this account follows: NIP-51 kind 10015.
 *
 * Reads the same list Amethyst and Primal write, so it is not a local
 * bookmark bar: a tag followed on a phone in another client shows up here.
 */
export default function FollowedTagsWidget({ onOpenTag }: { onOpenTag?: (tag: string) => void }) {
  const t = useTranslations();
  const { tags, ready } = useInterests();

  return (
    <Panel title={t('social.followedTags')} data-testid="widget-followed-tags">
      {!ready ? (
        <div className="space-y-1.5 p-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-5 rounded" />)}
        </div>
      ) : (tags ?? []).length === 0 ? (
        <WidgetEmpty testId="followed-tags-empty">{t('social.followedTagsEmpty')}</WidgetEmpty>
      ) : (
        <div className="flex flex-wrap gap-1.5 p-1">
          {(tags ?? []).map((tag) => (
            <Button
              variant="outlinePill"
              size="xs"
              key={tag}
              onClick={() => onOpenTag?.(tag)}
              data-testid="followed-tag"
            >
              #{tag}
            </Button>
          ))}
        </div>
      )}
    </Panel>
  );
}
