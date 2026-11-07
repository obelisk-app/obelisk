import { getPreferences, setPreference } from './preferences';
import { validZapPresets } from '@/schemas/preferences/zap-presets';
import type { FormSpec } from '@/types/common/form';
import type { ZapPreset } from '@/types/preferences/preferences';

export function zapPresetsForm(): FormSpec<{ presets: ZapPreset[] }> {
  return {
    initial: () => ({ presets: getPreferences().zapPresets.map((p) => ({ ...p })) }),
    validate: ({ presets }) => validZapPresets(presets) ? null : 'settings.wallet.presets.invalid',
    submit: ({ presets }) => setPreference('zapPresets', presets),
  };
}
