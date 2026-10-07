'use client';

import { useMemberList } from '@/hooks/chat/members/useMemberList';
import Text from '@/components/ui/layout/Text';
import { useTranslations } from 'next-intl';
import { MemberItem } from './MemberItem';

export default function MemberList({ groupId }: { groupId: string }) {
  const t = useTranslations();
  const vm = useMemberList(groupId);

  return (
    <div className="w-60 h-full bg-lc-dark border-l border-lc-border flex flex-col shrink-0">
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2" data-testid="member-list">
        {vm.onlineGroups.map((group) => (
          <div key={group.key} data-testid={`member-group-${group.key}`}>
            <Text as="div" size="10" weight="semibold" variant="label" tone="muted" className="px-2 py-1">
              {group.label} - {group.members.length}
            </Text>
            {group.members.map((member) => <MemberItem key={member.pubkey} member={member} isOnline />)}
          </div>
        ))}

        {vm.offline.length > 0 && (
          <div>
            <button
              type="button"
              onClick={vm.toggleOffline}
              className="flex items-center gap-1.5 px-2 py-1 w-full text-left"
              data-testid="offline-toggle"
            >
              <span className="text-[10px] text-lc-muted">{vm.offlineCollapsed ? '▸' : '▾'}</span>
              <Text size="10" weight="semibold" variant="label" tone="muted">
                {t('chat.members.offlineGroup')} - {vm.offline.length}
              </Text>
            </button>
            {!vm.offlineCollapsed && vm.offline.map((member) => (
              <MemberItem key={member.pubkey} member={member} isOnline={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
