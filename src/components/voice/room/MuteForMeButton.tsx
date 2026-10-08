'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import { useMuteForMeButton } from '@/hooks/voice/room/useMuteForMeButton';
import { MicIcon, MicOffIcon } from '@/assets/icons';

/** Mute one person for me only (the voice store's local mute list); the call does not hear about it. */
export default function MuteForMeButton({ pubkey, compact = false }: { pubkey: string; compact?: boolean }) {
  const t = useTranslations();
  const { muted, toggle } = useMuteForMeButton(pubkey);
  return (
    <Button
      variant="bare"
      type="button"
      onClick={toggle}
      title={t(muted ? 'voice.tile.unmuteForMe' : 'voice.tile.muteForMe')}
      data-testid="mute-for-me"
      data-muted={muted}
      className={
        'flex items-center justify-center rounded-md backdrop-blur transition-colors ' +
        (compact ? 'w-6 h-6 ' : 'px-2 py-1 ') +
        (muted
          ? 'bg-red-500/20 text-red-300 border border-red-400/40'
          : 'bg-black/60 text-white/80 border border-white/15 hover:bg-black/80')
      }
    >
      {muted ? <MicOffIcon size={compact ? 12 : 11} strokeWidth={2} /> : <MicIcon size={compact ? 12 : 11} strokeWidth={2} />}
    </Button>
  );
}
