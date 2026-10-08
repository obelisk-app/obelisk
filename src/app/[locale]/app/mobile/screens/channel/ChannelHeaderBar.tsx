'use client';

import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslations } from 'next-intl';
import BackButton from '../../chrome/BackButton';
import { GearIcon, SearchIcon, UsersIcon } from '@/assets/icons';

/** The phone channel header: category line, back, name, and the search / settings / members buttons. */
export function ChannelHeaderBar({ header, back, onSearch, isChannelAdmin, onOpenSettings, openMembers }: {
  header: { category: string | null; channel: string };
  back: () => void;
  onSearch: () => void;
  isChannelAdmin: boolean;
  onOpenSettings: () => void;
  openMembers: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="chat-header chat-header-compact">
      {/* The category rides its own line, so the ellipsis lands here
          rather than on the channel name. */}
      {header.category && (
        <div className="chat-breadcrumb" data-testid="channel-category">
          <span className="space-name-bc">{header.category}</span>
        </div>
      )}
      <div className="chat-row">
        <div className="chat-title-block">
          <BackButton onClick={back} />
          <div className="chat-channel" data-testid="channel-name"><span className="hash">#</span>{header.channel}</div>
        </div>
        <div className="chat-actions">
          <MobileSigningIndicator />
          <button className="icon-btn action-search" onClick={onSearch} aria-label={t('common.search')}>
            <SearchIcon size={null} />
          </button>
          {isChannelAdmin && (
            <button
              className="icon-btn action-menu"
              onClick={onOpenSettings}
              aria-label={t('shell.desktop.channel.settings')}
              data-testid="mobile-channel-settings-btn"
            >
              <GearIcon size={null} strokeWidth={1.5} />
            </button>
          )}
          <button className="icon-btn action-members" onClick={openMembers} aria-label={t('mobile.members.members')}>
            <UsersIcon size={null} />
          </button>
        </div>
      </div>
    </div>
  );
}
