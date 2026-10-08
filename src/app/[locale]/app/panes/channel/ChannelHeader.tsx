'use client';

import Text from '@/components/ui/layout/Text';
import Row from '@/components/ui/layout/Row';
import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import SearchBar from '../../search/SearchBar';
import { CopyInviteLinkButton } from './CopyInviteLinkButton';
import IconButton from '@/components/ui/buttons/IconButton';
import { GearIcon, UsersIcon } from '@/assets/icons';

type Props = {
  groupId: string;
  group: JsGroup | null | undefined;
  isAdmin: boolean;
  showMembers: boolean;
  onToggleMembers: () => void;
  onOpenSettings: () => void;
};

/** The channel's title bar: name, admin badge, settings, members toggle, invite link, search. */
export function ChannelHeader({ groupId, group, isAdmin, showMembers, onToggleMembers, onOpenSettings }: Props) {
  const t = useTranslations();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-lc-border bg-lc-dark px-5 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-xl text-lc-muted">#</span>
        <div className="min-w-0">
          <Row gap="2" align="center">
            <span className="truncate text-base font-bold text-lc-white">
              {group?.name ?? groupId.slice(0, 12)}
            </span>
            {isAdmin && (
              <span className="rounded-full bg-lc-green/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-lc-green">
                {t('mobile.members.admin')}
              </span>
            )}
          </Row>
          {group?.about && <Text as="div" variant="caption" className="truncate">{group.about}</Text>}
        </div>
      </div>
      <Row gap="2" align="center">
        {isAdmin && (
          <IconButton
            size="9"
            shape="square"
            onClick={onOpenSettings}
            title={t('shell.desktop.channel.settings')}
            aria-label={t('shell.desktop.channel.settings')}
          >
            <GearIcon size={20} strokeWidth={2} />
          </IconButton>
        )}
        <IconButton
          size="9"
          shape="square"
          onClick={onToggleMembers}
          title={showMembers ? t('shell.desktop.channel.hideMembers') : t('shell.desktop.channel.showMembers')}
          aria-label={showMembers ? t('shell.desktop.channel.hideMembers') : t('shell.desktop.channel.showMembers')}
          aria-pressed={showMembers}
        >
          <UsersIcon size={20} strokeWidth={2} />
        </IconButton>
        <CopyInviteLinkButton groupId={groupId} />
        <SearchBar
          serverName={group?.name ?? t('common.channel')}
          activeGroupId={groupId}
        />
      </Row>
    </header>
  );
}
