'use client';

import { useChatStore } from '@/store/chat';
import { shortNpub } from '@/lib/mentions';

interface MemberListProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

export default function MemberList({ profileCache }: MemberListProps) {
  const memberList = useChatStore(s => s.memberList);
  const onlinePubkeys = useChatStore(s => s.onlinePubkeys);

  const onlineCount = memberList.reduce(
    (acc, m) => acc + (onlinePubkeys.has(m.pubkey) ? 1 : 0),
    0,
  );

  const sortedMembers = [...memberList].sort((a, b) => {
    const aOnline = onlinePubkeys.has(a.pubkey) ? 1 : 0;
    const bOnline = onlinePubkeys.has(b.pubkey) ? 1 : 0;
    return bOnline - aOnline;
  });

  return (
    <div className="w-60 h-full bg-lc-dark border-l border-lc-border flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-lc-border">
        <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wide">
          Members — {onlineCount}/{memberList.length} online
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {sortedMembers.map(member => {
          const cached = profileCache.get(member.pubkey);
          const name = member.displayName || cached?.name || shortNpub(member.pubkey);
          const picture = member.picture || cached?.picture;
          const isOnline = onlinePubkeys.has(member.pubkey);

          return (
            <div
              key={member.pubkey}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
            >
              <div className={`relative shrink-0 ${isOnline ? '' : 'opacity-60'}`}>
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
                {/* Presence indicator */}
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-lc-dark ${
                    isOnline ? 'bg-lc-green' : 'bg-lc-muted'
                  }`}
                  title={isOnline ? 'Online' : 'Offline'}
                />
              </div>
              <span
                className={`text-sm truncate transition-colors ${
                  isOnline ? 'text-lc-white group-hover:text-white' : 'text-lc-muted'
                }`}
              >
                {name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
