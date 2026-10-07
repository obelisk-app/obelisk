'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import type { ChannelEmptyStage } from '@/utils/chat/timeline/channel-list-state';

/** Why a channel shows no messages: still loading its info or its history, empty, or not visible. */
export function ChannelEmpty({ groupId, group, stage }: {
  groupId: string;
  group: JsGroup | null | undefined;
  stage: ChannelEmptyStage;
}) {
  const t = useTranslations();
  if (stage === 'loading-info' || stage === 'loading-messages') {
    return (
      <div
        className="flex h-full items-center justify-center text-sm text-lc-muted"
        data-testid="messages-loading"
        data-stage={stage === 'loading-info' ? 'channel-info' : 'messages'}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" aria-hidden="true" />
          <div>{stage === 'loading-info' ? t('shell.desktop.channel.loadingInfo') : t('shell.desktop.channel.loadingMessages')}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center text-sm text-lc-muted">
      <div className="max-w-md text-center">
        {group ? (
          <>
            <div className="text-base font-medium text-lc-white">
              {t('shell.desktop.channel.welcome', { name: group.name ?? t('common.channel') })}
            </div>
            <div className="mt-1">{t('shell.desktop.channel.noMessages')}</div>
          </>
        ) : (
          <>
            <div className="text-base font-medium text-lc-white">
              {t('shell.desktop.channel.notVisible')}
            </div>
            <div className="mt-1">
              {t('shell.desktop.channel.notVisibleDescription', { id: `${groupId.slice(0, 16)}...` })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
