'use client';

import { useChatStore } from '@/store/chat';

interface MemberListProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function MemberList({ profileCache }: MemberListProps) {
  const memberList = useChatStore(s => s.memberList);

  return (
    <div className="w-60 bg-lc-dark border-l border-lc-border flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-lc-border">
        <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wide">
          Members — {memberList.length}
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {memberList.map(member => {
          const cached = profileCache.get(member.pubkey);
          const name = member.displayName || cached?.name || member.pubkey.slice(0, 8) + '...';
          const picture = member.picture || cached?.picture;

          return (
            <div
              key={member.pubkey}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              {picture ? (
                <img
                  src={picture}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-lc-border flex items-center justify-center shrink-0">
                  <span className="text-xs text-lc-muted">
                    {name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm text-lc-white truncate">{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
