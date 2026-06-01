'use client';

import { useEffect, useState } from 'react';
import {
  APPEARANCE_DEFAULTS,
  resetAppearancePreferences,
  setPreference,
  usePreferences,
  type Preferences,
} from '@/lib/preferences';
import { useTranslation } from '@/i18n/context';

type AppearanceKey = 'accentColor' | 'backgroundColor' | 'buttonColor' | 'bubbleColor';

interface AppearancePreferenceControlsProps {
  variant?: 'desktop' | 'mobile';
}

const CONTROLS: Array<{ key: AppearanceKey; labelKey: string; descriptionKey: string; testId: string }> = [
  {
    key: 'accentColor',
    labelKey: 'preferences.appearance.accent.label',
    descriptionKey: 'preferences.appearance.accent.description',
    testId: 'appearance-accent-color',
  },
  {
    key: 'backgroundColor',
    labelKey: 'preferences.appearance.background.label',
    descriptionKey: 'preferences.appearance.background.description',
    testId: 'appearance-background-color',
  },
  {
    key: 'buttonColor',
    labelKey: 'preferences.appearance.buttons.label',
    descriptionKey: 'preferences.appearance.buttons.description',
    testId: 'appearance-button-color',
  },
  {
    key: 'bubbleColor',
    labelKey: 'preferences.appearance.bubbles.label',
    descriptionKey: 'preferences.appearance.bubbles.description',
    testId: 'appearance-bubble-color',
  },
];

export default function AppearancePreferenceControls({ variant = 'desktop' }: AppearancePreferenceControlsProps) {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const isMobile = variant === 'mobile';

  return (
    <div
      data-testid="appearance-controls"
      className={isMobile ? 'settings-section' : 'space-y-3 border-t border-lc-border pt-4'}
    >
      <div className={isMobile ? 'settings-section-title' : 'text-xs font-semibold uppercase tracking-wider text-lc-muted'}>
        {t('preferences.appearance.title')}
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
      <button
        type="button"
        onClick={resetAppearancePreferences}
        className={isMobile
          ? 'settings-btn-secondary'
          : 'rounded-md border border-lc-border bg-lc-black px-3 py-1.5 text-sm text-lc-white transition hover:bg-lc-border/40'}
      >
        {t('preferences.appearance.reset')}
      </button>
    </div>
  );
}

function ColorPreferenceRow({
  control,
  t,
  value,
  isMobile,
}: {
  control: { key: AppearanceKey; labelKey: string; descriptionKey: string; testId: string };
  t: (key: string) => string;
  value: string;
  isMobile: boolean;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    setDraft(next);
    if (/^#[0-9a-f]{6}$/i.test(next)) {
      setPreference(control.key, next.toLowerCase() as Preferences[AppearanceKey]);
    }
  };

  return (
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-md border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>{t(control.labelKey)}</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>{t(control.descriptionKey)}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="color"
          aria-label={t('preferences.appearance.colorAria').replace('{label}', t(control.labelKey))}
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-md border border-lc-border bg-transparent p-0"
        />
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          data-testid={control.testId}
          aria-label={t('preferences.appearance.hexAria').replace('{label}', t(control.labelKey))}
          className={isMobile
            ? 'appearance-hex-input'
            : 'w-24 rounded-md border border-lc-border bg-lc-dark px-2 py-1.5 font-mono text-xs text-lc-white outline-none focus:border-lc-green'}
          placeholder={APPEARANCE_DEFAULTS[control.key]}
        />
      </div>
    </div>
  );
}


const BUBBLE_ANIMATION_OPTIONS = [
  { value: 'float', labelKey: 'preferences.appearance.bubbleMotion.float' },
  { value: 'drift', labelKey: 'preferences.appearance.bubbleMotion.drift' },
  { value: 'orbit', labelKey: 'preferences.appearance.bubbleMotion.orbit' },
  { value: 'still', labelKey: 'preferences.appearance.bubbleMotion.still' },
] as const;

function BubbleAnimationRow({ value, isMobile, t }: { value: Preferences['bubbleAnimation']; isMobile: boolean; t: (key: string) => string }) {
  return (
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-md border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>{t('preferences.appearance.bubbleMotion.label')}</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>
          {t('preferences.appearance.bubbleMotion.description')}
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => setPreference('bubbleAnimation', e.target.value as Preferences['bubbleAnimation'])}
        data-testid="appearance-bubble-animation"
        aria-label={t('preferences.appearance.bubbleMotion.aria')}
        className={isMobile
          ? 'appearance-select'
          : 'w-full rounded-md border border-lc-border bg-lc-dark px-2 py-1.5 text-xs text-lc-white outline-none focus:border-lc-green'}
      >
        {BUBBLE_ANIMATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
        ))}
      </select>
    </div>
  );
}
