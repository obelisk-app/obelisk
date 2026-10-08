'use client';

import Button from '@/components/ui/buttons/Button';
import { avatarInitials, displayNameFor } from '@/utils/identity/display-name';
import { useAuthor } from '@/hooks/social/profile/useAuthor';
import { shortNpubLabel } from '@/utils/identity/short-npub';
import { avatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** A recent conversation on the new-message screen, named from the merged profile tiers. */
export function ComposeRecentRow({ peer, onClick }: { peer: string; onClick: () => void }) {
  const meta = useAuthor(peer);
  const name = displayNameFor(peer, meta);
  return (
    <Button variant="bare" className="dm-row" onClick={onClick}>
      <div className="dm-ava-list" style={avatarStyle(peer)}>
        {meta?.picture ? <RemoteImage src={meta.picture} alt="" /> : avatarInitials(name, peer)}
      </div>
      <div className="dm-meta">
        <div className="dm-row-top">
          <span className="dm-name">{name}</span>
        </div>
        <div className="dm-preview">{meta?.nip05 ?? shortNpubLabel(peer)}</div>
      </div>
    </Button>
  );
}
