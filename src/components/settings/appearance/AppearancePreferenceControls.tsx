'use client';

import { resetAppearancePreferences } from '@/services/preferences/preferences';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import ColorPreferenceRow, { type ColorControl } from './ColorPreferenceRow';
import BubbleAnimationRow from './BubbleAnimationRow';

interface AppearancePreferenceControlsProps {
  variant?: 'desktop' | 'mobile';
}

const CONTROLS: ColorControl[] = [
  {
    key: 'accentColor',
    labelKey: 'settings.preferences.appearance.accent.label',
    descriptionKey: 'settings.preferences.appearance.accent.description',
    testId: 'appearance-accent-color',
  },
  {
    key: 'backgroundColor',
    labelKey: 'settings.preferences.appearance.background.label',
    descriptionKey: 'settings.preferences.appearance.background.description',
    testId: 'appearance-background-color',
  },
  {
    key: 'buttonColor',
    labelKey: 'settings.preferences.appearance.buttons.label',
    descriptionKey: 'settings.preferences.appearance.buttons.description',
    testId: 'appearance-button-color',
  },
  {
    key: 'bubbleColor',
    labelKey: 'settings.preferences.appearance.bubbles.label',
    descriptionKey: 'settings.preferences.appearance.bubbles.description',
    testId: 'appearance-bubble-color',
  },
];

export default function AppearancePreferenceControls({ variant = 'desktop' }: AppearancePreferenceControlsProps) {
  const t = useTranslations();
  const prefs = usePreferences();
  const isMobile = variant === 'mobile';

  return (
    <div
      data-testid="appearance-controls"
      className={isMobile ? 'settings-section' : 'space-y-3 border-t border-lc-border pt-4'}
    >
      <div className={isMobile ? 'settings-section-title' : 'text-xs font-semibold uppercase tracking-wider text-lc-muted'}>
        {t('settings.preferences.appearance.title')}
      </div>
      <div className={isMobile ? 'contents' : 'space-y-2'}>
        {CONTROLS.map((control) => (
          <ColorPreferenceRow
            key={control.key}
            control={control}
            t={t}
            value={prefs[control.key]}
            isMobile={isMobile}
          />
        ))}
        <BubbleAnimationRow value={prefs.bubbleAnimation} isMobile={isMobile} t={t} />
      </div>
      {isMobile ? (
        // The mobile shell's stylesheet button; it stays off the desktop primitives.
        <Button variant="bare" type="button" onClick={resetAppearancePreferences} className="settings-btn-secondary">
          {t('settings.preferences.appearance.reset')}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={resetAppearancePreferences}>
          {t('settings.preferences.appearance.reset')}
        </Button>
      )}
    </div>
  );
}
