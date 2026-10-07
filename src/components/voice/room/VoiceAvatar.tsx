import RemoteImage from '@/components/ui/media/RemoteImage';

/** A participant's picture, or their initial, glowing while they speak. */
export default function VoiceAvatar({ pubkey, picture, name, size, speaking = false }: { pubkey: string; picture?: string | null; name: string; size: number; speaking?: boolean }) {
  const px = `${size * 4}px`;
  const speakingClass = speaking ? ' shadow-[0_0_12px_rgba(180,249,83,0.55)]' : '';
  if (picture) {
    return <RemoteImage src={picture} alt={name} className={'rounded-full object-cover' + speakingClass} style={{ width: px, height: px }} />;
  }
  return (
    <div
      className={'rounded-full bg-gradient-to-br from-lc-olive to-neutral-800 flex items-center justify-center text-lc-green font-semibold ring-1 ring-white/10' + speakingClass}
      style={{ width: px, height: px, fontSize: `${Math.max(12, size * 1.4)}px` }}
    >
      {(name[0] ?? pubkey[0])?.toUpperCase()}
    </div>
  );
}
