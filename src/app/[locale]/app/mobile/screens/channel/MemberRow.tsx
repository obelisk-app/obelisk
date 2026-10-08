'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { useUserMetadata } from '@/services/nostr-bridge';
import RoleBadge from '@/components/chat/members/RoleBadge';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** One person in the phone member list: avatar (faded when offline), name, NIP-05 or npub, badges, presence dot. */
export function MemberRow({ pubkey, role, online, onClick }: { pubkey: string; role?: 'admin'; online: boolean; onClick: () => void }) {
  const t = useTranslations();
  const meta = useUserMetadata(pubkey);
  const name = displayNameFor(pubkey, meta);
  return (
    <Button variant="bare" className="member-row" onClick={onClick}>
      <div className={`dm-ava-list ${online ? '' : 'offline'}`} style={{ ...avatarStyle(pubkey), width: 36, height: 36, fontSize: 12 }}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, pubkey)}
      </div>
      <div className="member-row-meta">
        <span className="member-row-name">{name}</span>
        <span className="member-row-nip">{meta?.nip05 ?? shortNpubLabel(pubkey)}</span>
      </div>
      <RoleBadge pubkey={pubkey} />
      {role === 'admin' && <span className="role-badge b-core">{t('mobile.members.admin')}</span>}
      <span className={`member-row-presence ${online ? 'on' : 'off'}`} />
    </Button>
  );
}
