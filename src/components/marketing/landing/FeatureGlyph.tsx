import type { LandingFeatureId } from '@/constants/marketing/landing';
import { BoltIcon, ChatIcon, DiceIcon, LayersIcon, LockLargeIcon, MicAltIcon, ShieldIcon } from '@/assets/icons';

/** The icon on one landing feature card. */
export default function FeatureGlyph({ feature }: { feature: LandingFeatureId }) {
  if (feature === 'nostrIdentity') return <ShieldIcon size={28} strokeWidth={1.5} />;
  if (feature === 'realtimeChat') return <ChatIcon size={28} strokeWidth={1.5} />;
  if (feature === 'encryptedDMs') return <LockLargeIcon size={28} strokeWidth={1.5} />;
  if (feature === 'voice') return <MicAltIcon size={28} strokeWidth={1.5} />;
  if (feature === 'selfHosted') return <LayersIcon size={28} strokeWidth={1.5} />;
  if (feature === 'zaps') return <BoltIcon size={28} strokeWidth={1.5} />;
  // A die: the games are the one feature here you can lose at.
  return <DiceIcon size={28} strokeWidth={1.5} />;
}
