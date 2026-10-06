'use client';

import type { JsGroup } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import SearchBar from '../../SearchBar';
import { CopyInviteLinkButton } from './CopyInviteLinkButton';
import Button from '@/components/ui/Button';

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
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-bold text-lc-white">
              {group?.name ?? groupId.slice(0, 12)}
            </span>
            {isAdmin && (
              <span className="rounded-full bg-lc-green/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-lc-green">
                {t('mobile.members.admin')}
              </span>
            )}
          </div>
          {group?.about && <div className="truncate text-xs text-lc-muted">{group.about}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon-md"
            onClick={onOpenSettings}
            className="rounded-md"
            title={t('shell.desktop.channel.settings')}
            aria-label={t('shell.desktop.channel.settings')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </Button>
        )}
        {/* Pressed is green at rest and on hover; `aria-pressed:` variants
            sort after the ghost colours, so they win without a conflict. */}
        <Button
          variant="ghost"
          size="icon-md"
          onClick={onToggleMembers}
          className="rounded-md aria-pressed:text-lc-green aria-pressed:hover:text-lc-green"
          title={showMembers ? t('shell.desktop.channel.hideMembers') : t('shell.desktop.channel.showMembers')}
          aria-label={showMembers ? t('shell.desktop.channel.hideMembers') : t('shell.desktop.channel.showMembers')}
          aria-pressed={showMembers}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </Button>
        <CopyInviteLinkButton groupId={groupId} />
        <SearchBar
          serverName={group?.name ?? t('common.channel')}
          activeGroupId={groupId}
        />
      </div>
    </header>
  );
}
