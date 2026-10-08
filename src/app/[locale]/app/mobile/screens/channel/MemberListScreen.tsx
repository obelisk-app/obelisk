'use client';

import { useTranslations } from 'next-intl';
import { useMemberListScreen } from '@/hooks/shell/mobile/screens/channel/useMemberListScreen';
import BackButton from '@/components/ui/buttons/BackButton';
import { MemberRow } from './MemberRow';

/** The phone member list: admins, then a section per relay role, then everyone else, with who is online. */
export function MemberListScreen({ groupId, back, openProfile }: { groupId: string; back: () => void; openProfile: (p: string) => void }) {
  const t = useTranslations();
  const vm = useMemberListScreen(groupId);

  return (
    <div className="screen member-list-screen active" data-screen="member-list">
      <div className="chat-header chat-header-compact">
        <div className="chat-row">
          <div className="chat-title-block">
            <BackButton onClick={back} />
            <div className="chat-channel"><span className="hash">#</span>{vm.header.channel} · {t('mobile.members.label')}</div>
          </div>
          <div className="member-presence-count">{vm.onlineCount}/{vm.total}</div>
        </div>
      </div>
      <div className="search-body">
        {vm.admins.length > 0 && (
          <>
            <div className="member-section-label" data-testid="member-section-admin">{t('mobile.members.admins')} · {vm.admins.length}</div>
            {vm.admins.map((p) => <MemberRow key={p} pubkey={p} role="admin" online={vm.isOnline(p)} onClick={() => openProfile(p)} />)}
          </>
        )}
        {vm.sections.map((section) => (
          <div key={section.key} data-testid={`member-section-${section.key}`}>
            <div className="member-section-label">{section.label} · {section.pubkeys.length}</div>
            {section.pubkeys.map((p) => <MemberRow key={p} pubkey={p} online={vm.isOnline(p)} onClick={() => openProfile(p)} />)}
          </div>
        ))}
        {vm.loading && (
          <div
            className="empty-state"
            data-testid="members-loading"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}
          >
            <div className="lc-spinner" aria-hidden="true" />
            <div className="empty-state-title">{t('mobile.members.loading')}</div>
          </div>
        )}
        {vm.empty && (
          <div className="empty-state">
            <div className="empty-state-title">{t('mobile.members.empty')}</div>
            <div className="empty-state-desc">{t('mobile.members.emptyDescription')}</div>
          </div>
        )}
      </div>
    </div>
  );
}
