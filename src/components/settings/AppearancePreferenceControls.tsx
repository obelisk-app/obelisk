'use client';

import { useState } from 'react';
import { APPEARANCE_DEFAULTS, resetAppearancePreferences, setPreference, type Preferences } from '@/services/preferences';
import { usePreferences } from '@/hooks/usePreferences';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import type { Translate } from '@/i18n/keys';
import type { MessageKey } from '@/i18n/keys';

type AppearanceKey = 'accentColor' | 'backgroundColor' | 'buttonColor' | 'bubbleColor';

interface AppearancePreferenceControlsProps {
  variant?: 'desktop' | 'mobile';
}

const CONTROLS: Array<{ key: AppearanceKey; labelKey: MessageKey; descriptionKey: MessageKey; testId: string }> = [
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
        <button type="button" onClick={resetAppearancePreferences} className="settings-btn-secondary">
          {t('settings.preferences.appearance.reset')}
        </button>
      ) : (
        <Button variant="secondary" size="sm" onClick={resetAppearancePreferences} className="bg-lc-black">
          {t('settings.preferences.appearance.reset')}
        </Button>
      )}
    </div>
  );
}

function ColorPreferenceRow({
  control,
  t,
  value,
  isMobile,
}: {
  control: { key: AppearanceKey; labelKey: MessageKey; descriptionKey: MessageKey; testId: string };
  t: Translate;
  value: string;
  isMobile: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // A new saved value replaces the draft in the same render (a reset from
  // the Reset button, or a change made on another surface).
  const [syncedValue, setSyncedValue] = useState(value);
  if (syncedValue !== value) {
    setSyncedValue(value);
    setDraft(value);
  }

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


const BUBBLE_ANIMATION_OPTIONS = [
  { value: 'float', labelKey: 'settings.preferences.appearance.bubbleMotion.float' },
  { value: 'drift', labelKey: 'settings.preferences.appearance.bubbleMotion.drift' },
  { value: 'orbit', labelKey: 'settings.preferences.appearance.bubbleMotion.orbit' },
  { value: 'still', labelKey: 'settings.preferences.appearance.bubbleMotion.still' },
] as const;

function BubbleAnimationRow({ value, isMobile, t }: { value: Preferences['bubbleAnimation']; isMobile: boolean; t: Translate }) {
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
