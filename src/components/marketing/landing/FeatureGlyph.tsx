import type { LandingFeatureId } from '@/constants/marketing/landing';
import { ZapIcon, ChatIcon, DiceIcon, LayersIcon, LockIcon, MicIcon, ShieldIcon } from '@/assets/icons';

/** The icon on one landing feature card. */
export default function FeatureGlyph({ feature }: { feature: LandingFeatureId }) {
  if (feature === 'nostrIdentity') return <ShieldIcon size={28} strokeWidth={1.5} />;
  if (feature === 'realtimeChat') return <ChatIcon size={28} strokeWidth={1.5} />;
  if (feature === 'encryptedDMs') return <LockIcon size={28} strokeWidth={1.5} />;
  if (feature === 'voice') return <MicIcon size={28} strokeWidth={1.5} />;
  if (feature === 'selfHosted') return <LayersIcon size={28} strokeWidth={1.5} />;
  if (feature === 'zaps') return <ZapIcon size={28} strokeWidth={1.5} />;
  // A die: the games are the one feature here you can lose at.
  return <DiceIcon size={28} strokeWidth={1.5} />;
}
