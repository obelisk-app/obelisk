'use client';

/**
 * DM call privacy settings: who can ring you, whether calls hide your IP,
 * and which relays carry the call's setup. See docs/voice/dm-calls.md.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CALL_RELAY_MAX, DEFAULT_CALL_RELAYS, normalizeCallRelays, setPreference, type CallIpProtection, type CallsFrom } from '@/services/preferences';
import { usePreferences } from '@/hooks/usePreferences';
import { CloseIcon } from '@/components/ui/icons';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Text from '@/components/ui/Text';

function isWss(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'wss:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

function Choice<T extends string>({
  name, value, options, onChange, mobile,
}: {
  name: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; mobile: boolean;
}) {
  return (
    <div className={mobile ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-1.5'} role="radiogroup">
      {options.map((o) => (
        <Chip
          key={o.value}
          behavior="radio"
          size="touch"
          state={value === o.value ? 'selected' : 'idle'}
          onClick={() => onChange(o.value)}
          className="font-semibold"
          data-testid={`${name}-${o.value}`}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function CallRelayEditor({
  saved, onStatus,
}: {
  saved: readonly string[]; onStatus: (s: 'idle' | 'saved' | 'invalid') => void;
}) {
  const t = useTranslations();
  // Seeded from the saved list; the parent remounts this (`key`) whenever the
  // saved list changes, so there is nothing to re-sync.
  const [draft, setDraft] = useState<string[]>(() => [...saved]);

  const save = () => {
    const filled = draft.map((r) => r.trim()).filter(Boolean);
    if (filled.length === 0 || filled.some((r) => !isWss(r))) {
      onStatus('invalid');
      return;
    }
    setPreference('callRelays', normalizeCallRelays(filled));
    onStatus('saved');
  };

  return (
    <>
      {draft.map((relay, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={relay}
            onChange={(e) => { setDraft((cur) => cur.map((r, j) => (j === i ? e.target.value : r))); onStatus('idle'); }}
            aria-label={`${t('settings.calls.relay')} ${i + 1}`}
            invalid={relay.trim() !== '' && !isWss(relay)}
            fontSize="xs"
            className="min-w-0 flex-1 font-mono"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="wss://relay.example"
            data-testid="call-relay-input"
          />
          <Button
            variant="ghost"
            tone="danger"
            size="icon-md"
            className="shrink-0"
            onClick={() => { setDraft((cur) => cur.filter((_, j) => j !== i)); onStatus('idle'); }}
            disabled={draft.length <= 1}
            aria-label={`${t('settings.calls.removeRelay')} ${relay || i + 1}`}
          >
            <CloseIcon size={14} />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="pillSecondary"
          size="xs"
          onClick={() => { setDraft((cur) => [...cur, '']); onStatus('idle'); }}
          disabled={draft.length >= CALL_RELAY_MAX}
        >
          {t('settings.calls.addRelay')}
        </Button>
        <Button variant="pillSecondary" size="xs" onClick={() => { setDraft([...DEFAULT_CALL_RELAYS]); onStatus('idle'); }}>
          {t('settings.calls.reset')}
        </Button>
        <Button variant="pill" size="xs" onClick={save} data-testid="call-relay-save">
          {t('common.save')}
        </Button>
      </div>
    </>
  );
}

export default function CallSettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const prefs = usePreferences();
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid'>('idle');

  const body = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.from.label')}</div>
        <p className="text-xs text-lc-muted">{t('settings.calls.fromHint')}</p>
        <Choice<CallsFrom>
          name="calls-from"
          mobile={mobile}
          value={prefs.callsFrom}
          onChange={(v) => setPreference('callsFrom', v)}
          options={[
            { value: 'contacts', label: t('settings.calls.from.contacts') },
            { value: 'anyone', label: t('settings.calls.from.anyone') },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.ip.label')}</div>
        <p className="text-xs text-lc-muted">{t('settings.calls.ipHint')}</p>
        <Choice<CallIpProtection>
          name="call-ip"
          mobile={mobile}
          value={prefs.callIpProtection}
          onChange={(v) => setPreference('callIpProtection', v)}
          options={[
            { value: 'auto', label: t('settings.calls.ip.auto') },
            { value: 'always', label: t('settings.calls.ip.always') },
            { value: 'never', label: t('settings.calls.ip.never') },
          ]}
        />
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.relays')}</div>
        <p className="text-xs text-lc-muted">{t('settings.calls.relaysHint')}</p>
        <CallRelayEditor key={prefs.callRelays.join(' ')} saved={prefs.callRelays} onStatus={setStatus} />
        {status !== 'idle' && (
          <span className={`text-xs ${status === 'invalid' ? 'text-red-400' : 'text-lc-green'}`} role="status">
            {t(status === 'invalid' ? 'settings.calls.invalid' : 'settings.calls.saved')}
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
