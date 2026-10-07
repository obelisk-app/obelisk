'use client';

import { useTranslations } from 'next-intl';
import { type JsGroup } from '@/services/nostr-bridge';
import { useChannelRowBody } from '@/hooks/shell/mobile/screens/server/useChannelRow';
import { channelRowClass, isVoiceKind } from '@/utils/shell/mobile/channel-row';
import { ChannelRowCounts } from './ChannelRowCounts';

export type ChannelRowProps = {
  group: JsGroup;
  live: boolean;
  active?: boolean;
  onClick: () => void;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  indent?: boolean;
};

const FORUM_ICON = (
  <span className="ch-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h18M3 12h18M3 19h18" /></svg>
  </span>
);
const CHEVRON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
);

/**
 * One row in the phone channel list: the icon for text, voice or forum, the
 * live-call marker on voice, and the unread and mention counts derived from
 * the read-state cursor. A forum with threads splits into two click zones:
 * the row opens the forum (as on desktop), the chevron expands its threads.
 */
export function ChannelRowBody({ group, live, active, onClick, expandable, expanded, onToggleExpand, indent }: ChannelRowProps) {
  const t = useTranslations();
  const row = useChannelRowBody(group);
  const counts = <ChannelRowCounts muted={row.muted} unread={row.unread} mentionsOrReplies={row.mentionsOrReplies} />;
  if (isVoiceKind(group.kind)) {
    return (
      <button className={`ch-row voice ${active ? 'active' : ''}`} onClick={onClick}>
        <span className="ch-icon" style={{ color: live ? 'var(--accent)' : 'var(--app-text-mute)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /></svg>
        </span>
        <div className="ch-body">
          <div className="ch-row-top">
            <span className="ch-name">{row.name}</span>
            {live && <span className="voice-live-dot" />}
            {live && <span className="ch-meta" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{t('mobile.channel.live')}</span>}
          </div>
        </div>
      </button>
    );
  }
  if (group.kind === 'forum' && expandable && onToggleExpand) {
    return (
      <div className={channelRowClass({ active, unread: row.unread, indent, split: true })} style={row.quietStyle}>
        <button className="ch-row-body" onClick={onClick}>
          {FORUM_ICON}
          <span className="ch-name">{row.name}</span>
          {counts}
        </button>
        <button
          className="ch-chevron-btn"
          onClick={onToggleExpand}
          aria-label={t(expanded ? 'mobile.channel.collapsePublications' : 'mobile.channel.expandPublications')}
          aria-expanded={!!expanded}
        >
          <span className={`ch-chevron ${expanded ? 'expanded' : ''}`} aria-hidden="true">{CHEVRON}</span>
        </button>
      </div>
    );
  }
  if (group.kind === 'forum') {
    return (
      <button className={channelRowClass({ active, unread: row.unread, indent })} onClick={onClick} style={row.quietStyle}>
        {FORUM_ICON}
        <span className="ch-name">{row.name}</span>
        {counts}
        <span className="ch-chevron" aria-hidden="true">{CHEVRON}</span>
      </button>
    );
  }
  return (
    <button className={channelRowClass({ active, unread: row.unread, indent })} onClick={onClick} style={row.quietStyle}>
      <span className="ch-icon">#</span>
      <span className="ch-name">{row.name}</span>
      {counts}
    </button>
  );
}
