'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials } from '@/utils/identity/display-name';
import { useIdentitySearchResult } from '@/hooks/identity/useIdentitySearchResult';
import { type UserHit } from '@/constants/identity/user-search';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** A person found by the new-message search: avatar, name, NIP-05 or npub. */
export function ComposeUserRow({ hit, onClick }: { hit: UserHit; onClick: () => void }) {
  const row = useIdentitySearchResult(hit);
  return (
    <Button variant="bare" className="dm-row" onClick={onClick} data-testid="mobile-user-search-result">
      <div className="dm-ava-list" style={avatarStyle(hit.pubkey)}>
        {row.picture ? <RemoteImage src={row.picture} alt="" /> : avatarInitials(row.name, hit.pubkey)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top"><span className="dm-name">{row.name}</span></div>
        <div className="dm-preview" data-nip05-state={row.nip05State}>{row.sub}</div>
      </div>
    </Button>
  );
}
