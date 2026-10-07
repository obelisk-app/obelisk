import { useTranslations } from 'next-intl';
import { useActiveCallByChannel, useGroups } from '@/services/nostr-bridge';

/**
 * The phone voice room's header: the channel, whether it is an SFU room, and
 * the call status line. Status only shows once a call exists; the topology
 * (SFU vs P2P) is the inline tag next to the title, so the line stays empty
 * on the idle "no one's here" view instead of repeating "SFU room".
 */
export function useVoiceRoomScreen(groupId: string) {
  const t = useTranslations();
  const groups = useGroups();
  const group = groups.find((g) => g.id === groupId) ?? null;
  const call = useActiveCallByChannel()[groupId] ?? null;
  const status = call?.status;
  const sub =
    status === 'connected' ? t('mobile.voice.connected') :
    status === 'starting' ? t('mobile.voice.starting') :
    status === 'active' ? t('mobile.voice.live') :
    status ?? null; // an unknown status is a wire value, shown as it came
  return { group, isSfu: group?.kind === 'voice-sfu', sub };
}
