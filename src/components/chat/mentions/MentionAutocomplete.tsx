'use client';

import type { MemberInfo } from '@/utils/message-text/mentions';
import { useMentionAutocomplete } from '@/hooks/chat/mentions/useMentionAutocomplete';
import RemoteImage from '@/components/ui/media/RemoteImage';
import OptionRow from '@/components/ui/forms/OptionRow';

interface Props {
  members: MemberInfo[];
  selectedIndex: number;
  onSelect: (member: MemberInfo) => void;
  onHover: (index: number) => void;
  onClose: () => void;
}

/**
 * Desktop skin of the mention picker. Behaviour (touch, mouse, scroll into
 * view, outside click, the npub label) is `useMentionAutocomplete`, shared
 * with `MobileMentionAutocomplete`; only the classes are this file's.
 */
export default function MentionAutocomplete({ members, selectedIndex, onSelect, onHover, onClose }: Props) {
  const { rootRef, rows } = useMentionAutocomplete({ members, selectedIndex, onSelect, onHover, onClose });

  if (rows.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-48 overflow-y-auto rounded-xl border border-lc-border bg-lc-dark shadow-lg"
      data-testid="mention-autocomplete"
    >
      {rows.map(({ member, active, keyLabel, initials, props }) => (
        <OptionRow
          key={member.pubkey}
          {...props}
          active={active}
          data-testid="mention-option"
        >
          {member.picture ? (
            <RemoteImage src={member.picture} alt="" className="h-6 w-6 rounded-full object-cover" />
          ) : (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-lc-border text-xs font-semibold text-lc-green">
              {initials}
            </div>
          )}
          <span className="truncate text-sm font-medium text-lc-white">{member.displayName}</span>
          <span className="ml-auto truncate text-xs text-lc-muted">{keyLabel}</span>
        </OptionRow>
      ))}
    </div>
  );
}
