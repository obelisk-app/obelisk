'use client';

import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/ui/media/UserAvatar';
import Button from '@/components/ui/buttons/Button';
import Card from '@/components/ui/layout/Card';
import Text from '@/components/ui/layout/Text';
import { useModerationRow } from '@/hooks/settings/privacy/useModerationRow';
import type { ModerationKind } from '@/utils/settings/moderation-entries';

/** A muted or blocked person with the button that undoes it. */
export default function ModerationRow({ pubkey, kind }: { pubkey: string; kind: ModerationKind }) {
  const t = useTranslations();
  const { name, picture, undo } = useModerationRow(pubkey, kind);
  return (
    <Card as="li" surface="black" radius="lg" padding="row" className="flex items-center gap-2">
      <UserAvatar pubkey={pubkey} picture={picture} size={6} name={name} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs text-lc-white">{name}</div>
        <Text as="div" size="10" tone="muted">
          {t(kind === 'mute' ? 'settings.moderation.muted' : 'settings.moderation.blocked')}
        </Text>
      </div>
      <Button
        variant="outline"
        size="xs"
        className="shrink-0"
        onClick={undo}
        data-testid={`moderation-undo-${kind}`}
      >
        {t(kind === 'mute' ? 'social.profileFeed.unmute' : 'social.profileFeed.unblock')}
      </Button>
    </Card>
  );
}
