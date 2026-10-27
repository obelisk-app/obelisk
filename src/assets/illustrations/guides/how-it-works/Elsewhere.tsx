import { useTranslations } from 'next-intl';
import ElsewherePill from './ElsewherePill';
import RelaysGlyph from './RelaysGlyph';
import VoiceGlyph from './VoiceGlyph';
import BoltGlyph from './BoltGlyph';

/**
 * What the app reaches on its own, beside the group's server: other Nostr
 * relays for profiles and DMs, voice (peer to peer, or an SFU the channel
 * admin picks) and the Lightning wallet that pays zaps.
 */
export default function Elsewhere() {
  const t = useTranslations();
  const head = { fontSize: 13, fontWeight: 700, fill: '#fafafa' };
  const sub = { fontSize: 11, fill: '#a3a3a3' };
  return (
    <g>
      <ElsewherePill x={16} w={244} icon={<RelaysGlyph />}>
        <text x="68" y="309" {...head}>{t('guides.art.howObeliskWorks.relays')}</text>
        <text x="68" y="327" {...sub}>{t('guides.art.howObeliskWorks.relayRoles')}</text>
      </ElsewherePill>
      <ElsewherePill x={278} w={244} icon={<VoiceGlyph />}>
        <text x="330" y="305" {...head}>{t('guides.art.howObeliskWorks.voice')}</text>
        <text x="330" y="322" {...sub}>{t('guides.art.howObeliskWorks.voiceMesh')}</text>
        <text x="330" y="337" {...sub}>{t('guides.art.howObeliskWorks.voiceSfu')}</text>
      </ElsewherePill>
      <ElsewherePill x={540} w={244} icon={<BoltGlyph />}>
        <text x="592" y="309" {...head}>{t('guides.art.howObeliskWorks.wallet')}</text>
        <text x="592" y="327" {...sub}>{t('guides.art.howObeliskWorks.walletDoes')}</text>
      </ElsewherePill>
    </g>
  );
}
