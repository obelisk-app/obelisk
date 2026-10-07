import { displayNameFor, type ViewerProfile } from '@/services/server/viewer/nostr-fetch';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { shortNpubLabel } from '@/utils/identity/short-npub';

/** A note author's picture, or the first letter of their name (or short npub) when they have none. */
export default function HashtagAvatar({ profile, pubkey }: { profile?: ViewerProfile; pubkey: string }) {
  const name = profile ? displayNameFor(profile) : shortNpubLabel(pubkey);
  if (profile?.picture) {
    return (
      <RemoteImage
        src={profile.picture}
        alt=""
        decoding="async"
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lc-dark text-[10px] font-semibold">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
