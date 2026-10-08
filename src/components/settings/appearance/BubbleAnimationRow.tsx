'use client';

import { setPreference } from '@/services/preferences/preferences';
import type { Preferences } from '@/types/preferences/preferences';
import Select from '@/components/ui/forms/Select';
import type { Translate } from '@/i18n/keys';

const BUBBLE_ANIMATION_OPTIONS = [
  { value: 'float', labelKey: 'settings.preferences.appearance.bubbleMotion.float' },
  { value: 'drift', labelKey: 'settings.preferences.appearance.bubbleMotion.drift' },
  { value: 'orbit', labelKey: 'settings.preferences.appearance.bubbleMotion.orbit' },
  { value: 'still', labelKey: 'settings.preferences.appearance.bubbleMotion.still' },
] as const;

/** How the background bubbles move. */
export default function BubbleAnimationRow({ value, isMobile, t }: { value: Preferences['bubbleAnimation']; isMobile: boolean; t: Translate }) {
  return (
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-md border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>{t('settings.preferences.appearance.bubbleMotion.label')}</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>
          {t('settings.preferences.appearance.bubbleMotion.description')}
        </div>
      </div>
      <Select
        variant={isMobile ? 'mobile' : 'surface'}
        size="xs"
        tone="dark"
        value={value}
        onChange={(e) => setPreference('bubbleAnimation', e.target.value as Preferences['bubbleAnimation'])}
        data-testid="appearance-bubble-animation"
        aria-label={t('settings.preferences.appearance.bubbleMotion.aria')}
        className={isMobile ? undefined : 'w-full'}
      >
        {BUBBLE_ANIMATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
        ))}
      </Select>
    </div>
  );
}
