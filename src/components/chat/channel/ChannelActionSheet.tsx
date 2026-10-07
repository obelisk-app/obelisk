'use client';

import { useTranslations } from 'next-intl';
import { useChannelActionSheet } from '@/hooks/chat/channel/useChannelActionSheet';
import Sheet from '@/components/ui/overlays/Sheet';
import SheetHeader from '@/app/[locale]/app/mobile/sheets/chrome/SheetHeader';
import { MUTE_OPTIONS, NOTIFY_OPTIONS, type ChannelMenuTarget } from '@/utils/chat/channel/channel-menu-options';
import { ChannelSheetRow } from './ChannelSheetRow';

/** The phone's long-press version of the channel menu, as a sheet with drill-in views. */
export function ChannelActionSheet({ target, onClose }: { target: ChannelMenuTarget; onClose: () => void }) {
  const t = useTranslations();
  const vm = useChannelActionSheet(target, onClose);

  return (
    <Sheet onClose={onClose} screen="channel-menu" label={target.name} testId="channel-action-sheet" maxHeight="88%">
      {vm.view === 'main' ? <SheetHeader title={`# ${target.name}`} /> : (
        <SheetHeader
          title={vm.view === 'mute' ? t('chat.channelMenu.mute.label') : t('chat.channelMenu.notify.label')}
          onBack={() => vm.showView('main')}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {vm.view === 'main' && <>
          <ChannelSheetRow label={t('chat.channelMenu.markRead')} onClick={vm.markRead} testId="channel-menu-mark-read" disabled={!target.hasUnread} />
          <ChannelSheetRow
            label={vm.following ? t('chat.channelMenu.unfollow') : t('chat.channelMenu.follow')}
            onClick={vm.toggleFollow}
            testId="channel-menu-follow"
            hint={vm.following ? t('chat.channelMenu.unfollowHint') : null}
          />
          {vm.muted
            ? <ChannelSheetRow label={t('chat.channelMenu.unmute')} onClick={vm.unmute} testId="channel-menu-unmute" hint={vm.mutedLabel} />
            : <ChannelSheetRow label={t('chat.channelMenu.mute.label')} onClick={() => vm.showView('mute')} testId="channel-menu-mute" chevron />}
          <ChannelSheetRow
            label={t('chat.channelMenu.notify.label')}
            onClick={() => vm.showView('notify')}
            testId="channel-menu-notify"
            chevron
            hint={t(`chat.channelMenu.notify.${vm.level}`)}
          />
          <ChannelSheetRow label={t('chat.channelMenu.copyLink')} onClick={vm.copyLink} testId="channel-menu-copy-link" />
        </>}
        {vm.view === 'mute' && MUTE_OPTIONS.map((o) => (
          <ChannelSheetRow key={o.ms} label={t(o.key)} onClick={() => vm.mute(o.ms)} testId={`channel-menu-mute-${o.ms}`} />
        ))}
        {vm.view === 'notify' && NOTIFY_OPTIONS.map((o) => (
          <ChannelSheetRow
            key={o.level}
            label={t(o.key)}
            onClick={() => vm.setLevel(o.level)}
            testId={`channel-menu-notify-${o.level}`}
            checked={vm.level === o.level}
          />
        ))}
      </div>
    </Sheet>
  );
}
