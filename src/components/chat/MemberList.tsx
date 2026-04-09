'use client';

import { useChatStore } from '@/store/chat';

interface MemberListProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function MemberList({ profileCache }: MemberListProps) {
  const memberList = useChatStore(s => s.memberList);

  return (
    <div className="w-60 bg-lc-dark border-l border-r border-lc-border flex flex-col shrink-0">
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
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div className="relative shrink-0">
                {picture ? (
                  <img
                    src={picture}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center">
                    <span className="text-xs font-medium text-lc-green">
                      {name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}
                {/* Online indicator */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-lc-green rounded-full border-2 border-lc-dark" />
              </div>
              <span className="text-sm text-lc-white truncate group-hover:text-white transition-colors">
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
