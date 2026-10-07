'use client';

import type { MemberInfo } from '@/utils/message-text/mentions';
import { useMentionAutocomplete } from '@/hooks/chat/mentions/useMentionAutocomplete';
import RemoteImage from '@/components/ui/media/RemoteImage';

/**
 * Phone skin of the mention picker, anchored above the composer. Behaviour
 * (touch vs mouse paths, scroll into view, the npub label) is
 * `useMentionAutocomplete`, shared with the desktop `MentionAutocomplete`;
 * this file owns the mobile CSS variables and tap-friendly row sizing.
 */
export function MobileMentionAutocomplete({
  members,
  selectedIndex,
  onSelect,
  onHover,
}: {
  members: MemberInfo[];
  selectedIndex: number;
  onSelect: (m: MemberInfo) => void;
  onHover: (i: number) => void;
}) {
  const { rootRef, rows } = useMentionAutocomplete({ members, selectedIndex, onSelect, onHover });
  if (rows.length === 0) return null;
  return (
    <div ref={rootRef} className="composer-mention-popup" data-testid="mobile-mention-autocomplete">
      {rows.map(({ member, active, keyLabel, initials, props }) => (
        <button
          key={member.pubkey}
          type="button"
          {...props}
          className={`composer-mention-row ${active ? 'active' : ''}`}
          data-testid="mobile-mention-option"
        >
          {member.picture ? (
            <RemoteImage src={member.picture} alt="" className="composer-mention-avatar" />
          ) : (
            <div className="composer-mention-avatar fallback">{initials}</div>
          )}
          <span className="composer-mention-name">{member.displayName}</span>
          <span className="composer-mention-key">{keyLabel}</span>
        </button>
      ))}
    </div>
  );
}
