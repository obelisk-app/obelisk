'use client';

import { APPEARANCE_DEFAULTS } from '@/services/preferences/preferences';
import Input from '@/components/ui/forms/Input';
import type { MessageKey, Translate } from '@/i18n/keys';
import { useColorPreferenceRow, type AppearanceColorKey } from '@/hooks/settings/appearance/useColorPreferenceRow';

export interface ColorControl { key: AppearanceColorKey; labelKey: MessageKey; descriptionKey: MessageKey; testId: string }

/** One appearance colour: a swatch picker and a hex box for the same preference. */
export default function ColorPreferenceRow({
  control,
  t,
  value,
  isMobile,
}: {
  control: ColorControl;
  t: Translate;
  value: string;
  isMobile: boolean;
}) {
  const { draft, commit } = useColorPreferenceRow(control.key, value);
  return (
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-md border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>{t(control.labelKey)}</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>{t(control.descriptionKey)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          variant="bare"
          type="color"
          aria-label={t('settings.preferences.appearance.colorAria', { label: t(control.labelKey) })}
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-lc-border bg-transparent p-0"
        />
        <Input
          variant="bare"
          type="text"
          inputMode="text"
          spellCheck={false}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          data-testid={control.testId}
          aria-label={t('settings.preferences.appearance.hexAria', { label: t(control.labelKey) })}
          className={isMobile
            ? 'appearance-hex-input'
            : 'w-24 rounded-md border border-lc-border bg-lc-dark px-2 py-1.5 font-mono text-xs text-lc-white outline-none focus:border-lc-green'}
          placeholder={APPEARANCE_DEFAULTS[control.key]}
        />
      </div>
    </div>
  );
}
