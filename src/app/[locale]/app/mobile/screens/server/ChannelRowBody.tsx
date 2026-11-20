'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { type JsGroup } from '@/services/nostr-bridge';
import { useChannelRowBody } from '@/hooks/shell/mobile/screens/server/useChannelRow';
import { channelRowClass, isVoiceKind } from '@/utils/shell/mobile/channel-row';
import { PublicCallPreview } from '@/components/voice/room/PublicCallPreview';
import { ChannelRowCounts } from './ChannelRowCounts';
import { ListIcon, MicIcon } from '@/assets/icons';

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
    <ListIcon size={null} strokeWidth={1.5} />
  </span>
);

/**
 * One row in the phone channel list: the icon for text, voice or forum, the
 * live-call marker on voice, and the unread and mention counts derived from
 * the read-state cursor. A forum with threads splits into two click zones:
 * the row opens the forum (as on desktop), the triangle expands its threads.
 */
export function ChannelRowBody({ group, live, active, onClick, expandable, expanded, onToggleExpand, indent }: ChannelRowProps) {
  const t = useTranslations();
  const row = useChannelRowBody(group);
  const counts = <ChannelRowCounts muted={row.muted} unread={row.unread} mentionsOrReplies={row.mentionsOrReplies} />;
  const voice = isVoiceKind(group.kind);
  if (voice && !expandable) {
    return (
      <>
        <Button variant="bare" className={`ch-row voice ${active ? 'active' : ''}`} onClick={onClick}>
          <span className="ch-icon" style={{ color: live ? 'var(--accent)' : 'var(--app-text-mute)' }}>
            <MicIcon size={null} />
          </span>
          <div className="ch-body">
            <div className="ch-row-top">
              <span className="ch-name">{row.name}</span>
              {live && <span className="voice-live-dot" />}
              {live && <span className="ch-meta" style={{ marginLeft: 'auto', color: 'var(--accent)' }}>{t('mobile.channel.live')}</span>}
            </div>
          </div>
        </Button>
        {group.isPublic && !group.isHidden && <PublicCallPreview groupId={group.id} menu />}
      </>
    );
  }
  if (expandable && onToggleExpand) {
    return (
      <>
        <div className={channelRowClass({ active, unread: row.unread, indent, split: true })} style={row.quietStyle}>
          <Button variant="bare" className="ch-row-body" onClick={onClick}>
            {group.kind === 'forum' ? FORUM_ICON : (
              <span className="ch-icon">{voice ? <MicIcon size={null} /> : '#'}</span>
            )}
            <span className="ch-name">{row.name}</span>
            {voice && live && <span className="voice-live-dot" />}
            {counts}
          </Button>
          <Button
            variant="bare"
            className="ch-subchannels-btn"
            onClick={onToggleExpand}
            aria-label={t(expanded ? 'common.subchannels.showRecent' : 'common.subchannels.showAll')}
            aria-expanded={!!expanded}
          >
            <span className="channel-expand-triangle" aria-hidden="true" />
          </Button>
        </div>
        {voice && group.isPublic && !group.isHidden && <PublicCallPreview groupId={group.id} menu />}
      </>
    );
  }
  if (group.kind === 'forum') {
    return (
      <Button variant="bare" className={channelRowClass({ active, unread: row.unread, indent })} onClick={onClick} style={row.quietStyle}>
        {FORUM_ICON}
        <span className="ch-name">{row.name}</span>
        {counts}
      </Button>
    );
  }
  return (
    <Button variant="bare" className={channelRowClass({ active, unread: row.unread, indent })} onClick={onClick} style={row.quietStyle}>
      <span className="ch-icon">#</span>
      <span className="ch-name">{row.name}</span>
      {counts}
    </Button>
  );
}
