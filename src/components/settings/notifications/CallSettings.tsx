'use client';

/**
 * DM call privacy settings: who can ring you, whether calls hide your IP,
 * and which relays carry the call's setup. See docs/voice/dm-calls.md.
 */

import { useTranslations } from 'next-intl';
import type { CallIpProtection, CallsFrom } from '@/services/preferences/preferences';
import Text from '@/components/ui/layout/Text';
import { useCallSettings } from '@/hooks/settings/notifications/useCallSettings';
import CallChoice from './CallChoice';
import CallRelayEditor from './CallRelayEditor';

export default function CallSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const vm = useCallSettings();

  const body = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.from.label')}</div>
        <Text as="p" variant="caption">{t('settings.calls.fromHint')}</Text>
        <CallChoice<CallsFrom>
          name="calls-from"
          mobile={mobile}
          value={vm.callsFrom}
          onChange={vm.setCallsFrom}
          options={[
            { value: 'contacts', label: t('settings.calls.from.contacts') },
            { value: 'anyone', label: t('settings.calls.from.anyone') },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.ip.label')}</div>
        <Text as="p" variant="caption">{t('settings.calls.ipHint')}</Text>
        <CallChoice<CallIpProtection>
          name="call-ip"
          mobile={mobile}
          value={vm.ipProtection}
          onChange={vm.setIpProtection}
          options={[
            { value: 'auto', label: t('settings.calls.ip.auto') },
            { value: 'always', label: t('settings.calls.ip.always') },
            { value: 'never', label: t('settings.calls.ip.never') },
          ]}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.relays')}</div>
        <Text as="p" variant="caption">{t('settings.calls.relaysHint')}</Text>
        <CallRelayEditor key={vm.relaysKey} saved={vm.relays} onStatus={vm.setStatus} />
        {vm.status !== 'idle' && (
          <span className={`text-xs ${vm.status === 'invalid' ? 'text-red-400' : 'text-lc-green'}`} role="status">
            {t(vm.status === 'invalid' ? 'settings.calls.invalid' : 'settings.calls.saved')}
          </span>
        )}
      </div>
    </div>
  );

  return mobile ? (
    <div className="settings-section" data-testid="call-settings">
      <div className="settings-section-title">{t('settings.calls.title')}</div>
      <div className="settings-row !block">{body}</div>
    </div>
  ) : (
    <div className="space-y-3 border-t border-lc-border pt-4" data-testid="call-settings">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">{t('settings.calls.title')}</Text>
      {body}
    </div>
  );
}
