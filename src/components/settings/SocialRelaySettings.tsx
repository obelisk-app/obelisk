'use client';

/**
 * Social (feed) relay configuration.
 *
 * Replaces `ProfileFeedRelaySettings`, which offered exactly three fixed text
 * boxes: `parseProfileFeedRelays` returned `null` for any other count, so
 * there was no way to add a fourth relay or drop to two, no way to see
 * whether a relay was reachable, and no way to reuse the relay list the user
 * had already published as NIP-65.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMyPubkey } from '@/lib/nostr-bridge';
import { setPreference, usePreferences } from '@/lib/preferences';
import {
  DEFAULT_SOCIAL_RELAYS,
  SOCIAL_RELAY_MAX,
  invalidRelayIndexes,
  normalizeSocialRelays,
} from '@/lib/social/relays';
import { applySocialRelays, importNip65Relays } from '@/lib/social/pool';
import { useTranslation } from '@/i18n/context';

type Status = 'idle' | 'saved' | 'invalid' | 'importing' | 'import-empty';

export default function SocialRelaySettings({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();
  const saved = usePreferences().socialRelays;
  const myPubkey = useMyPubkey();
  const [draft, setDraft] = useState<string[]>(() => [...saved]);
  const [status, setStatus] = useState<Status>('idle');

  // Re-sync when another surface changes the list (e.g. an import elsewhere).
  useEffect(() => { setDraft([...saved]); }, [saved]);

  const invalid = useMemo(() => new Set(invalidRelayIndexes(draft)), [draft]);
  const canAdd = draft.length < SOCIAL_RELAY_MAX;

  const update = (index: number, value: string) => {
    setDraft((current) => current.map((entry, i) => (i === index ? value : entry)));
    setStatus('idle');
  };

  const remove = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index));
    setStatus('idle');
  };

  const save = () => {
    const filled = draft.map((entry) => entry.trim()).filter(Boolean);
    if (filled.length === 0 || invalid.size > 0) {
      setStatus('invalid');
      return;
    }
    const normalized = normalizeSocialRelays(filled);
    setPreference('socialRelays', normalized);
    // Point the SDK at the new set immediately so the next fetch routes
    // correctly without a reload.
    applySocialRelays(normalized);
    setDraft(normalized);
    setStatus('saved');
  };

  const importFromNip65 = async () => {
    if (!myPubkey) return;
    setStatus('importing');
    try {
      const imported = await importNip65Relays(myPubkey);
      if (imported.length === 0) {
        setStatus('import-empty');
        return;
      }
      setDraft(imported);
      setStatus('idle');
    } catch {
      setStatus('import-empty');
    }
  };

  const reset = () => {
    setDraft([...DEFAULT_SOCIAL_RELAYS]);
    setStatus('idle');
  };

  const fields = (
    <>
      <p className="text-xs text-lc-muted">{t('preferences.socialRelays.description')}</p>

      <div className="space-y-2">
        {draft.map((relay, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={relay}
              onChange={(event) => update(index, event.target.value)}
              aria-label={`${t('preferences.socialRelays.relay')} ${index + 1}`}
              aria-invalid={invalid.has(index)}
              className={`min-w-0 flex-1 rounded-lg border bg-lc-black px-3 py-2 font-mono text-xs text-lc-white outline-none ${
                invalid.has(index) ? 'border-red-500' : 'border-lc-border focus:border-lc-green'
              }`}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="wss://relay.example"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              className="shrink-0 rounded-lg border border-lc-border px-2 py-2 text-xs text-lc-muted hover:text-red-400 disabled:opacity-40"
              aria-label={`${t('preferences.socialRelays.remove')} ${relay || index + 1}`}
              disabled={draft.length <= 1}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setDraft((current) => [...current, '']); setStatus('idle'); }}
          className="lc-pill-secondary px-3 py-1.5 text-xs disabled:opacity-40"
          disabled={!canAdd}
          data-testid="social-relay-add"
        >
          + {t('preferences.socialRelays.add')}
        </button>
        {myPubkey && (
          <button
            type="button"
            onClick={() => void importFromNip65()}
            className="lc-pill-secondary px-3 py-1.5 text-xs"
            data-testid="social-relay-import"
          >
            {t('preferences.socialRelays.import')}
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="lc-pill-secondary px-3 py-1.5 text-xs"
          data-testid="social-relay-reset"
        >
          {t('preferences.socialRelays.reset')}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="lc-pill-primary px-4 py-2 text-xs" data-testid="social-relay-save">
          {t('common.save')}
        </button>
        {status !== 'idle' && (
          <span
            className={`text-xs ${status === 'invalid' || status === 'import-empty' ? 'text-red-400' : 'text-lc-green'}`}
            role="status"
          >
            {t(
              status === 'invalid'
                ? 'preferences.socialRelays.invalid'
                : status === 'importing'
                  ? 'preferences.socialRelays.importing'
                  : status === 'import-empty'
                    ? 'preferences.socialRelays.importEmpty'
                    : 'preferences.profileFeed.saved',
            )}
          </span>
        )}
      </div>
    </>
  );

  return mobile ? (
    <div className="settings-section" data-testid="social-relay-settings">
      <div className="settings-section-title">{t('preferences.socialRelays.title')}</div>
      <div className="settings-row !block space-y-3">{fields}</div>
    </div>
  ) : (
    <div className="space-y-3 border-t border-lc-border pt-4" data-testid="social-relay-settings">
      <div className="text-xs font-semibold uppercase tracking-wider text-lc-muted">
        {t('preferences.socialRelays.title')}
      </div>
      {fields}
    </div>
  );
}
