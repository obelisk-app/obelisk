import { useTranslations } from 'next-intl';

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

function RadioColumn({ x, title, options, selected }: { x: number; title: string; options: string[]; selected: number }) {
  return (
    <g>
      <text x={x} y="138" fontSize="9.5" fontWeight="700" fill="#a3a3a3" letterSpacing="0.6">
        {title}
      </text>
      {options.map((label, i) => {
        const y = 158 + i * 20;
        return (
          <g key={i}>
            <circle cx={x + 5} cy={y - 4} r="4.5" fill={i === selected ? '#b4f953' : 'none'} stroke="#b4f953" strokeWidth="1.2" />
            <text x={x + 15} y={y} fontSize="10.5" fill={i === selected ? '#fafafa' : '#a3a3a3'}>
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function MemberRow({ y, name, badge, action }: { y: number; name: string; badge: string; action: string }) {
  return (
    <g>
      <circle cx="309" cy={y - 4} r="8" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1.2" />
      <text x="323" y={y} fontSize="11" fontWeight="600" fill="#fafafa">
        {name}
      </text>
      <rect x="356" y={y - 13} width="52" height="16" rx="8" fill="#2d3a1a" />
      <text x="382" y={y - 2} textAnchor="middle" fontSize="9" fontWeight="700" fill="#b4f953">
        {badge}
      </text>
      <rect x="452" y={y - 15} width="64" height="20" rx="10" fill="none" stroke="#b4f953" strokeWidth="1.2" />
      <text x="484" y={y - 1} textAnchor="middle" fontSize="10" fontWeight="600" fill="#b4f953">
        {action}
      </text>
    </g>
  );
}
