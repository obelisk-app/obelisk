'use client';

import { useEffect, useRef } from 'react';
import { MemberInfo } from '@/lib/mentions';

interface MentionAutocompleteProps {
  members: MemberInfo[];
  onSelect: (member: MemberInfo) => void;
  onClose: () => void;
  selectedIndex: number;
  /** When true, prepend a synthetic `@everyone` row at index 0. */
  showEveryone?: boolean;
  /** Called when the synthetic `@everyone` row is selected. */
  onSelectEveryone?: () => void;
}

export default function MentionAutocomplete({ members, onSelect, onClose, selectedIndex, showEveryone, onSelectEveryone }: MentionAutocompleteProps) {
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (members.length === 0 && !showEveryone) return null;

  const everyoneOffset = showEveryone ? 1 : 0;

  return (
    <div
      ref={ref}
      className="absolute left-4 right-4 bottom-full mb-1 z-50 bg-lc-dark border border-lc-border rounded-xl shadow-lg max-h-48 overflow-y-auto"
      data-testid="mention-autocomplete"
    >
      {showEveryone && (
        <button
          key="__everyone__"
          ref={(el) => { itemRefs.current[0] = el; }}
          onClick={() => onSelectEveryone?.()}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
            0 === selectedIndex ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'
          }`}
          data-testid="mention-option-everyone"
        >
          <div className="w-6 h-6 rounded-full bg-lc-green/20 flex items-center justify-center text-lc-green text-xs font-semibold">
            @
          </div>
          <span className="text-sm text-lc-white font-medium">@everyone</span>
          <span className="text-xs text-lc-muted ml-auto">Notify all members</span>
        </button>
      )}
      {members.map((member, i) => (
        <button
          key={member.pubkey}
          ref={(el) => { itemRefs.current[i + everyoneOffset] = el; }}
          onClick={() => onSelect(member)}
          className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
            i + everyoneOffset === selectedIndex ? 'bg-lc-border/60' : 'hover:bg-lc-border/40'
          }`}
          data-testid="mention-option"
        >
          {member.picture ? (
            <img src={member.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold">
              {member.displayName[0]?.toUpperCase() || '?'}
            </div>
          )}
          <span className="text-sm text-lc-white font-medium">{member.displayName}</span>
          <span className="text-xs text-lc-muted ml-auto">{member.pubkey.slice(0, 8)}...</span>
        </button>
      ))}
    </div>
  );
}
