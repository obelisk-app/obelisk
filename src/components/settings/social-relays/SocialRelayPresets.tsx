import Text from '@/components/ui/Text';
import { SOCIAL_RELAY_PRESETS } from '@/services/social/relays';
import { relayKey } from '@/hooks/settings/useSocialRelayDraft';

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
  t: (key: string) => string;
}) {
  const hasBlank = draft.some((entry) => !entry.trim());
  return (
    <div className="space-y-1.5">
      <Text as="p" variant="label" size="10" weight="semibold" tone="muted">
        {t('preferences.socialRelays.suggested')}
      </Text>
      <div className="flex flex-wrap gap-1.5" data-testid="social-relay-presets">
        {SOCIAL_RELAY_PRESETS.map((preset) => {
          const host = preset.url.replace(/^wss:\/\//, '');
          const already = draft.some((entry) => relayKey(entry) === preset.url);
          return (
            <button
              key={preset.url}
              type="button"
              onClick={() => onAdd(preset.url)}
              disabled={already || (!canAdd && !hasBlank)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-default ${
                already
                  ? 'border-lc-green/30 bg-lc-green/10 text-lc-green'
                  : 'border-lc-border text-lc-muted hover:border-lc-green/40 hover:text-lc-white disabled:opacity-40 disabled:hover:border-lc-border disabled:hover:text-lc-muted'
              }`}
              title={t(`preferences.socialRelays.preset.${preset.note}`)}
              data-testid="social-relay-preset"
              data-added={already || undefined}
            >
              <span aria-hidden="true">{already ? '\u2713' : '+'}</span>
              <span className="font-mono">{host}</span>
              <span className="hidden text-lc-muted/70 sm:inline">
                {t(`preferences.socialRelays.preset.${preset.note}`)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
