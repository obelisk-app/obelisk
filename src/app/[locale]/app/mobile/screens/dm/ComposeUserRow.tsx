'use client';

import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { type UserHit } from '@/constants/identity/user-search';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** A person found by the new-message search: avatar, name, NIP-05 or npub. */
export function ComposeUserRow({ hit, onClick }: { hit: UserHit; onClick: () => void }) {
  const name = hit.displayName || displayNameFor(hit.pubkey);
  return (
    <button className="dm-row" onClick={onClick} data-testid="mobile-user-search-result">
      <div className="dm-ava-list" style={avatarStyle(hit.pubkey)}>
        {hit.picture ? <RemoteImage src={hit.picture} alt="" /> : avatarInitials(name, hit.pubkey)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top"><span className="dm-name">{name}</span></div>
        <div className="dm-preview">{hit.nip05 ?? shortNpubLabel(hit.pubkey)}</div>
      </div>
    </button>
  );
}
