import Text from '@/components/ui/layout/Text';
import Card from '@/components/ui/layout/Card';
import Row from '@/components/ui/layout/Row';
import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import type { JsGroup } from '@/services/nostr-bridge';
import Skeleton from '@/components/ui/animations/Skeleton';

export function ThreadCardSkeleton({ thread, onOpen }: { thread: JsGroup; onOpen: () => void }) {
  const t = useTranslations();
  return (
    <Card variant="interactive" padding="md" asChild>
      <Button
        variant="bare"
        type="button"
        onClick={onOpen}
        className="w-full text-left opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all"
        data-testid="thread-card-skeleton"
        data-thread-id={thread.id}
        aria-label={thread.name ? t('chat.forum.openLoading', { name: thread.name }) : t('chat.forum.openLoadingUntitled')}
      >
        <Row gap="3" align="start">
          <Skeleton variant="circle" className="w-8 h-8 shrink-0" />
          <div className="flex-1 min-w-0">
            <Text as="div" size="sm" weight="semibold" tone="default" truncate="truncate">
              {thread.name || t('chat.forum.loadingTitle')}
            </Text>
            <Skeleton className="h-3 w-3/4 mt-1.5" />
            <div className="flex flex-wrap gap-x-3 mt-2">
              <Skeleton as="span" className="h-2 w-16 inline-block" />
              <Skeleton as="span" className="h-2 w-12 inline-block" />
            </div>
          </div>
        </Row>
      </Button>
    </Card>
  );
}
