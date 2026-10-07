'use client';

import { avatarInitials } from '@/utils/identity/display-name';
import { nameAvatarStyle } from '@/utils/shell/mobile/avatar-style';
import RemoteImage from '@/components/ui/media/RemoteImage';

/** A round avatar: the picture when there is one, else initials on the seed's gradient. */
export function NameAvatar({
  pubkey,
  name,
  picture,
  size = 36,
  className = '',
}: {
  pubkey: string;
  name?: string | null;
  picture?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <div className={className} style={nameAvatarStyle(pubkey || name || 'x', size)}>
      {/* Never letters off an npub: that rendered avatars reading `NP`. */}
      {picture ? <RemoteImage src={picture} alt="" /> : avatarInitials(name, pubkey)}
    </div>
  );
}
