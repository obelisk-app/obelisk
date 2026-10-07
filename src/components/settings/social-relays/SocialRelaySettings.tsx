'use client';

/**
 * Social (feed) relay configuration.
 *
 * Replaces `ProfileFeedRelaySettings`, which offered exactly three fixed text
 * boxes: `parseProfileFeedRelays` returned `null` for any other count, so
 * there was no way to add a fourth relay or drop to two, no way to see
 * whether a relay was reachable, and no way to reuse the relay list the user
 * had already published as NIP-65.
 *
 * The draft and its actions live in `useSocialRelayDraft`; the rows and the
 * suggestion chips are in `./social-relays/`.
 */

import { RELAY_SETTINGS_ANCHOR } from '@/utils/settings/open-settings';
import { useTranslations } from 'next-intl';
import { useSocialRelayDraft, type SocialRelayDraftStatus } from '@/hooks/settings/social-relays/useSocialRelayDraft';
import SocialRelayPresets from './SocialRelayPresets';
import SocialRelayRows from './SocialRelayRows';
import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import type { MessageKey } from '@/i18n/keys';

const STATUS_KEY: Record<Exclude<SocialRelayDraftStatus, 'idle'>, MessageKey> = {
  invalid: 'settings.preferences.socialRelays.invalid',
  importing: 'settings.preferences.socialRelays.importing',
  'import-empty': 'settings.preferences.socialRelays.importEmpty',
  saved: 'settings.preferences.profileFeed.saved',
};

export default function SocialRelaySettings({ mobile = false }: { mobile?: boolean }) {
  const t = useTranslations();
  const relays = useSocialRelayDraft();
  const { status } = relays;

  const fields = (
    <>
      <Text as="p" size="xs" tone="muted">{t('settings.preferences.socialRelays.description')}</Text>

      <SocialRelayRows
        draft={relays.draft}
        statuses={relays.statuses}
        invalid={relays.invalid}
        onUpdate={relays.update}
        onRemove={relays.remove}
        t={t}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="pillSecondary"
          size="xs"
          onClick={relays.addBlank}
          disabled={!relays.canAdd}
          data-testid="social-relay-add"
        >
          + {t('settings.preferences.socialRelays.add')}
        </Button>
        {relays.canImport && (
          <Button
            variant="pillSecondary"
            size="xs"
            onClick={() => void relays.importFromNip65()}
            data-testid="social-relay-import"
          >
            {t('settings.preferences.socialRelays.import')}
          </Button>
        )}
        <Button variant="pillSecondary" size="xs" onClick={relays.reset} data-testid="social-relay-reset">
          {t('settings.preferences.socialRelays.reset')}
        </Button>
      </div>

      <SocialRelayPresets draft={relays.draft} canAdd={relays.canAdd} onAdd={relays.addPreset} t={t} />

      <div className="flex items-center gap-3">
        <Button variant="pill" size="xs" onClick={relays.save} data-testid="social-relay-save">
          {t('common.save')}
        </Button>
        {status !== 'idle' && (
          <span
            className={`text-xs ${status === 'invalid' || status === 'import-empty' ? 'text-red-400' : 'text-lc-green'}`}
            role="status"
          >
            {t(STATUS_KEY[status])}
          </span>
        )}
      </div>
    </>
  );

  return mobile ? (
    <div className="settings-section" id={RELAY_SETTINGS_ANCHOR} data-testid="social-relay-settings">
      <div className="settings-section-title">{t('settings.preferences.socialRelays.title')}</div>
      <div className="settings-row !block space-y-3">{fields}</div>
    </div>
  ) : (
    <div className="space-y-3 border-t border-lc-border pt-4" id={RELAY_SETTINGS_ANCHOR} data-testid="social-relay-settings">
      <Text as="div" variant="label" size="xs" weight="semibold" tone="muted">
        {t('settings.preferences.socialRelays.title')}
      </Text>
      {fields}
    </div>
  );
}
