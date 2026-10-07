import { useTranslations } from 'next-intl';
import RadioColumn from './RadioColumn';
import MemberRow from './MemberRow';

const DIM = '#5c7a2e';

/** A channel admin's settings for one channel: access, type and its members. */
export default function ChannelSettingsPanel() {
  const t = useTranslations();
  const access = [t('guides.art.adminCli.public'), t('guides.art.adminCli.readOnly'), t('guides.art.adminCli.private')];
  const kinds = [t('guides.art.adminCli.text'), t('guides.art.adminCli.voice'), t('guides.art.adminCli.publications')];

  return (
    <g>
      <rect x="285" y="64" width="240" height="272" rx="12" fill="#0f0f0f" stroke={DIM} strokeWidth="1.6" />
      <text x="301" y="90" fontSize="13" fontWeight="700" fill="#fafafa">
        {t('guides.art.adminCli.channelSettings')}
      </text>
      <text x="301" y="106" fontSize="10" fill="#a3a3a3" fontFamily="monospace">
        #general {/* i18n-exempt: a sample channel name, as the app writes one */}
      </text>
      <line x1="301" y1="118" x2="509" y2="118" stroke="#262626" strokeWidth="1" />

      <RadioColumn x={301} title={t('guides.art.adminCli.access')} options={access} selected={1} />
      <RadioColumn x={411} title={t('guides.art.adminCli.type')} options={kinds} selected={0} />

      <text x="301" y="224" fontSize="9.5" fontWeight="700" fill="#a3a3a3" letterSpacing="0.6">
        {t('guides.art.adminCli.members')}
      </text>
      <MemberRow y={244} name="alice" badge={t('guides.art.adminCli.adminBadge')} action={t('guides.art.adminCli.demote')} />
      <MemberRow y={272} name="bob" badge={t('guides.art.adminCli.memberBadge')} action={t('guides.art.adminCli.remove')} />

      <rect x="301" y="292" width="215" height="24" rx="12" fill="none" stroke={DIM} strokeWidth="1.2" strokeDasharray="4 3" />
      <text x="408" y="308" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#b4f953">
        {t('guides.art.adminCli.addMember')}
      </text>
    </g>
  );
}
