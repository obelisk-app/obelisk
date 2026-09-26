'use client';

/**
 * DM call privacy settings: who can ring you, whether calls hide your IP,
 * and which relays carry the call's setup. See docs/voice/dm-calls.md.
 */

import { useState } from 'react';
import { useTranslation } from '@/i18n/context';
import {
  CALL_RELAY_MAX,
  DEFAULT_CALL_RELAYS,
  normalizeCallRelays,
  setPreference,
  usePreferences,
  type CallIpProtection,
  type CallsFrom,
} from '@/lib/preferences';
import { CloseIcon } from '@/components/ui/icons';

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
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o.value
              ? 'border-lc-green bg-lc-green/15 text-lc-green'
              : 'border-lc-border bg-lc-card/60 text-lc-white hover:border-lc-green/50'
          }`}
          data-testid={`${name}-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CallRelayEditor({
  saved, onStatus,
}: {
  saved: readonly string[]; onStatus: (s: 'idle' | 'saved' | 'invalid') => void;
}) {
  const { t } = useTranslation();
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
          <input
            value={relay}
            onChange={(e) => { setDraft((cur) => cur.map((r, j) => (j === i ? e.target.value : r))); onStatus('idle'); }}
            aria-label={`${t('settings.calls.relay')} ${i + 1}`}
            aria-invalid={relay.trim() !== '' && !isWss(relay)}
            className={`min-w-0 flex-1 rounded-lg border bg-lc-black px-3 py-2 font-mono text-xs text-lc-white outline-none ${
              relay.trim() !== '' && !isWss(relay) ? 'border-red-500' : 'border-lc-border focus:border-lc-green'
            }`}
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="wss://relay.example"
            data-testid="call-relay-input"
          />
          <button
            type="button"
            onClick={() => { setDraft((cur) => cur.filter((_, j) => j !== i)); onStatus('idle'); }}
            disabled={draft.length <= 1}
            className="shrink-0 rounded-lg border border-lc-border bg-lc-card/60 p-2 text-lc-white hover:text-red-400 disabled:opacity-40"
            aria-label={`${t('settings.calls.removeRelay')} ${relay || i + 1}`}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setDraft((cur) => [...cur, '']); onStatus('idle'); }}
          disabled={draft.length >= CALL_RELAY_MAX}
          className="lc-pill-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {t('settings.calls.addRelay')}
        </button>
        <button
          type="button"
          onClick={() => { setDraft([...DEFAULT_CALL_RELAYS]); onStatus('idle'); }}
          className="lc-pill-secondary px-3 py-1.5 text-xs"
        >
          {t('settings.calls.reset')}
        </button>
        <button type="button" onClick={save} className="lc-pill-primary px-4 py-1.5 text-xs" data-testid="call-relay-save">
          {t('common.save')}
        </button>
      </div>
    </>
  );
}

export default function CallSettings({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const [status, setStatus] = useState<'idle' | 'saved' | 'invalid'>('idle');

  const body = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.from')}</div>
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
        <div className="text-sm font-semibold text-lc-white">{t('settings.calls.ip')}</div>
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
      <div className="text-xs font-semibold uppercase tracking-wider text-lc-muted">{t('settings.calls.title')}</div>
      {body}
    </div>
  );
}
