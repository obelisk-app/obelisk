'use client';

import MobileSigningIndicator from '@/components/feedback/MobileSigningIndicator';
import { useTranslations } from 'next-intl';
import BackButton from '../../BackButton';

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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </button>
          {isChannelAdmin && (
            <button
              className="icon-btn action-menu"
              onClick={onOpenSettings}
              aria-label={t('shell.desktop.channel.settings')}
              data-testid="mobile-channel-settings-btn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          )}
          <button className="icon-btn action-members" onClick={openMembers} aria-label={t('mobile.members.members')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M3 21a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="3" /><path d="M23 19a4 4 0 0 0-7-2.65" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
