'use client';

import { useMemo, useState } from 'react';
import { useChatStore } from '@/store/chat';
import { shortNpub } from '@/lib/mentions';
import type { MemberInfo } from '@/lib/mentions';

function isIconUrl(icon: string): boolean {
  return /^(https?:)?\/\//i.test(icon) || icon.startsWith('/');
}

interface MemberListProps {
  profileCache: Map<string, { name?: string; picture?: string }>;
}

/** Base role priority used when the member has no custom roles. */
const BASE_ROLE_PRIORITY: Record<string, number> = {
  owner: 400,
  admin: 300,
  mod: 200,
  member: 100,
};

interface RoleGroup {
  key: string;
  label: string;
  color?: string;
  members: MemberInfo[];
}

/**
 * Groups members into sections by their highest-priority role (custom roles
 * first, then base role), with an "Offline" section at the bottom.
 */
function groupMembers(
  members: MemberInfo[],
  onlinePubkeys: Set<string>,
): { bots: MemberInfo[]; online: RoleGroup[]; offline: MemberInfo[] } {
  const botMembers: MemberInfo[] = [];
  const onlineMembers: MemberInfo[] = [];
  const offlineMembers: MemberInfo[] = [];

  for (const m of members) {
    if (m.isBot) {
      botMembers.push(m);
    } else if (onlinePubkeys.has(m.pubkey)) {
      onlineMembers.push(m);
    } else {
      offlineMembers.push(m);
    }
  }

  // Group online members by highest-priority role
  const groups = new Map<string, RoleGroup>();

  for (const m of onlineMembers) {
    const topCustom = m.customRoles?.length
      ? m.customRoles.reduce((best, cr) => (cr.priority > best.priority ? cr : best), m.customRoles[0])
      : null;

    const basePriority = BASE_ROLE_PRIORITY[m.role ?? 'member'] ?? 100;

    let groupKey: string;
    let groupLabel: string;
    let groupColor: string | undefined;
    let sortPriority: number;

    // A custom role always outranks the generic "member" tier. For staff
    // (mod/admin/owner) we still require the custom priority to numerically
    // beat the staff priority, so they keep their own sections by default.
    const baseIsMember = (m.role ?? 'member') === 'member';
    const customWins = topCustom && (baseIsMember || topCustom.priority > basePriority);

    if (customWins && topCustom) {
      groupKey = `custom:${topCustom.id}`;
      groupLabel = topCustom.name;
      groupColor = topCustom.color;
      sortPriority = Math.max(topCustom.priority, basePriority + 1);
    } else {
      groupKey = `base:${m.role ?? 'member'}`;
      groupLabel = (m.role ?? 'member').charAt(0).toUpperCase() + (m.role ?? 'member').slice(1);
      sortPriority = basePriority;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, { key: groupKey, label: groupLabel, color: groupColor, members: [] });
    }
    groups.get(groupKey)!.members.push(m);
    // Store priority for sorting (we'll sort after)
    (groups.get(groupKey)! as RoleGroup & { _priority?: number })._priority = sortPriority;
  }

  const sorted = [...groups.values()].sort((a, b) => {
    const ap = (a as RoleGroup & { _priority?: number })._priority ?? 0;
    const bp = (b as RoleGroup & { _priority?: number })._priority ?? 0;
    return bp - ap;
  });

  return { bots: botMembers, online: sorted, offline: offlineMembers };
}

export default function MemberList({ profileCache }: MemberListProps) {
  const memberList = useChatStore(s => s.memberList);
  const onlinePubkeys = useChatStore(s => s.onlinePubkeys);
  const [offlineCollapsed, setOfflineCollapsed] = useState(false);

  const { bots, online, offline } = useMemo(
    () => groupMembers(memberList, onlinePubkeys),
    [memberList, onlinePubkeys],
  );

  const humanMembers = memberList.filter((m) => !m.isBot);
  const onlineCount = humanMembers.reduce(
    (acc, m) => acc + (onlinePubkeys.has(m.pubkey) ? 1 : 0),
    0,
  );

  return (
    <div className="w-60 h-full bg-lc-dark border-l border-lc-border flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-lc-border">
        <h3 className="text-xs font-semibold text-lc-muted uppercase tracking-wide">
          Members — {onlineCount}/{humanMembers.length} online
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2" data-testid="member-list">
        {/* Bots group: always rendered first, never marked online/offline */}
        {bots.length > 0 && (
          <div data-testid="bots-group">
            <div className="flex items-center gap-1.5 px-2 py-1">
              <span className="text-[10px] font-semibold text-lc-muted uppercase tracking-wider">
                Bots — {bots.length}
              </span>
            </div>
            {bots.map((member) => (
              <MemberItem
                key={member.pubkey}
                member={member}
                profileCache={profileCache}
                isOnline
              />
            ))}
          </div>
        )}

        {/* Online groups */}
        {online.map((group) => (
          <div key={group.key}>
            <div className="flex items-center gap-1.5 px-2 py-1">
              {group.color && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
              )}
              <span className="text-[10px] font-semibold text-lc-muted uppercase tracking-wider">
                {group.label} — {group.members.length}
              </span>
            </div>
            {group.members.map((member) => (
              <MemberItem
                key={member.pubkey}
                member={member}
                profileCache={profileCache}
                isOnline
              />
            ))}
          </div>
        ))}

        {/* Offline section */}
        {offline.length > 0 && (
          <div>
            <button
              onClick={() => setOfflineCollapsed(!offlineCollapsed)}
              className="flex items-center gap-1.5 px-2 py-1 w-full text-left"
              data-testid="offline-toggle"
            >
              <span className="text-[10px] text-lc-muted">
                {offlineCollapsed ? '▸' : '▾'}
              </span>
              <span className="text-[10px] font-semibold text-lc-muted uppercase tracking-wider">
                Offline — {offline.length}
              </span>
            </button>
            {!offlineCollapsed && offline.map((member) => (
              <MemberItem
                key={member.pubkey}
                member={member}
                profileCache={profileCache}
                isOnline={false}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MemberItem({
  member,
  profileCache,
  isOnline,
}: {
  member: MemberInfo;
  profileCache: Map<string, { name?: string; picture?: string }>;
  isOnline: boolean;
}) {
  const cached = profileCache.get(member.pubkey);
  const name = member.displayName || cached?.name || shortNpub(member.pubkey);
  const picture = member.picture || cached?.picture;

  // Color the name by highest-priority custom role
  const topCustom = member.customRoles?.length
    ? member.customRoles.reduce((best, cr) => (cr.priority > best.priority ? cr : best), member.customRoles[0])
    : null;
  const nameColor = topCustom?.color;

  const isBot = !!member.isBot;

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group"
      data-testid={isBot ? 'bot-item' : 'member-item'}
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
        {!isBot && (
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-lc-dark ${
              isOnline ? 'bg-lc-green' : 'bg-lc-muted'
            }`}
            title={isOnline ? 'Online' : 'Offline'}
          />
        )}
      </div>
      {topCustom?.icon && (
        isIconUrl(topCustom.icon) ? (
          <img src={topCustom.icon} alt="" className="w-4 h-4 object-contain shrink-0" />
        ) : (
          <span className="text-sm shrink-0">{topCustom.icon}</span>
        )
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <span
          className={`text-sm truncate transition-colors ${
            isOnline ? 'group-hover:text-white' : 'text-lc-muted'
          }`}
          style={isOnline && nameColor ? { color: nameColor } : isOnline ? { color: 'var(--color-lc-white)' } : undefined}
        >
          {name}
        </span>
        {isBot && member.statusText && (
          <span
            className="text-[10px] text-lc-green font-mono truncate"
            data-testid="bot-status"
          >
            {member.statusText}
          </span>
        )}
      </div>
    </div>
  );
}
