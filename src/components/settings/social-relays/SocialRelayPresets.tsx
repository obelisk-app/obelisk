import Button from '@/components/ui/buttons/Button';
import Text from '@/components/ui/layout/Text';
import { SOCIAL_RELAY_PRESETS } from '@/constants/social/relays';
import { socialRelayPresetChips } from '@/utils/settings/social-relays';
import type { Translate } from '@/i18n/keys';

/** The suggested relays: one chip each, marked once it is already in the draft. */
export default function SocialRelayPresets({
  draft,
  canAdd,
  onAdd,
  t,
}: {
  draft: ReadonlyArray<string>;
  canAdd: boolean;
  onAdd: (url: string) => void;
  t: Translate;
}) {
  return (
    <div className="space-y-1.5">
      <Text as="p" variant="label" size="10" weight="semibold" tone="muted">
        {t('settings.preferences.socialRelays.suggested')}
      </Text>
      <div className="flex flex-wrap gap-1.5" data-testid="social-relay-presets">
        {socialRelayPresetChips(SOCIAL_RELAY_PRESETS, draft, canAdd).map((chip) => (
          <Button
            variant="bare"
            key={chip.url}
            type="button"
            onClick={() => onAdd(chip.url)}
            disabled={chip.disabled}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-default ${
              chip.added
                ? 'border-lc-green/30 bg-lc-green/10 text-lc-green'
                : 'border-lc-border text-lc-muted hover:border-lc-green/40 hover:text-lc-white disabled:opacity-40 disabled:hover:border-lc-border disabled:hover:text-lc-muted'
            }`}
            title={t(`settings.preferences.socialRelays.preset.${chip.note}`)}
            data-testid="social-relay-preset"
            data-added={chip.added || undefined}
          >
            <span aria-hidden="true">{chip.added ? '\u2713' : '+'}</span>
            <span className="font-mono">{chip.host}</span>
            <span className="hidden text-lc-muted/70 sm:inline">
              {t(`settings.preferences.socialRelays.preset.${chip.note}`)}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
