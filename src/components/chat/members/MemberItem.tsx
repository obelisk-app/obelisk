'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials } from '@/utils/identity/display-name';
import { useChatStore } from '@/store/chat';
import type { JsMemberInfo } from '@/services/nostr-bridge';
import RoleBadge from '@/components/chat/members/RoleBadge';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useTranslations } from 'next-intl';

/** One member row: avatar with a presence dot, the admin shield, the name and their top relay role. A click opens their profile. */
export function MemberItem({ member, isOnline }: { member: JsMemberInfo; isOnline: boolean }) {
  const t = useTranslations();
  // `displayName` is always set: `useGroupMemberInfo` resolves it through
  // `displayNameFor`, so there is nothing left to fall back to here.
  const name = member.displayName;
  const openProfilePopup = useChatStore((state) => state.openProfilePopup);

  return (
    <Button
      variant="bare"
      type="button"
      onClick={(event) => openProfilePopup(member.pubkey, { x: event.clientX, y: event.clientY })}
      className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
      data-testid="member-item"
    >
      <div className={`relative shrink-0 ${isOnline ? '' : 'opacity-60'}`}>
        {member.picture ? (
          <RemoteImage src={member.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center">
            {/* Not `name.slice(0, 2)`: that used to read letters off a hex
                pubkey and render an avatar labelled `6A`. */}
            <span className="text-xs font-medium text-lc-green">{avatarInitials(name, member.pubkey)}</span>
          </div>
        )}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-lc-dark ${
            isOnline ? 'bg-lc-green' : 'bg-lc-muted'
          }`}
          title={t(isOnline ? 'chat.members.online' : 'chat.members.offline')}
        />
      </div>
      {member.role === 'admin' && <span title={t('mobile.members.admin')} aria-label={t('shell.members.roleAdmin')}>🛡️</span>}
      <span className={`text-sm truncate ${isOnline ? 'text-lc-white' : 'text-lc-muted'}`}>
        {name}
      </span>
      <RoleBadge pubkey={member.pubkey} className="ml-auto max-w-[42%]" />
    </Button>
  );
}
