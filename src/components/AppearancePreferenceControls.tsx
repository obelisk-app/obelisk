'use client';

import { useEffect, useState } from 'react';
import {
  APPEARANCE_DEFAULTS,
  resetAppearancePreferences,
  setPreference,
  usePreferences,
  type Preferences,
} from '@/lib/preferences';

type AppearanceKey = 'accentColor' | 'backgroundColor' | 'buttonColor' | 'bubbleColor';

interface AppearancePreferenceControlsProps {
  variant?: 'desktop' | 'mobile';
}

const CONTROLS: Array<{ key: AppearanceKey; label: string; description: string; testId: string }> = [
  {
    key: 'accentColor',
    label: 'Accent',
    description: 'Highlights, links, active states',
    testId: 'appearance-accent-color',
  },
  {
    key: 'backgroundColor',
    label: 'Background',
    description: 'Main app backdrop',
    testId: 'appearance-background-color',
  },
  {
    key: 'buttonColor',
    label: 'Buttons',
    description: 'Primary actions',
    testId: 'appearance-button-color',
  },
  {
    key: 'bubbleColor',
    label: 'Bubbles',
    description: 'Animated background chat bubbles',
    testId: 'appearance-bubble-color',
  },
];

const DESKTOP_COLOR_PRESETS = [
  { name: 'Obelisk', value: '#b4f953' },
  { name: 'Cyan', value: '#7ec8ff' },
  { name: 'Violet', value: '#a78bfa' },
  { name: 'Amber', value: '#f0c14a' },
  { name: 'Rose', value: '#ff7ad9' },
] as const;

export default function AppearancePreferenceControls({ variant = 'desktop' }: AppearancePreferenceControlsProps) {
  const prefs = usePreferences();
  const isMobile = variant === 'mobile';

  return (
    <div
      data-testid="appearance-controls"
      className={isMobile ? 'settings-section' : 'space-y-3 rounded-2xl border border-lc-border bg-lc-black/30 p-4'}
    >
      <div className={isMobile ? 'settings-section-title' : 'text-xs font-semibold uppercase tracking-wider text-lc-muted'}>
        Appearance
      </div>
      <div className={isMobile ? 'contents' : 'space-y-2'}>
        {CONTROLS.map((control) => (
          <ColorPreferenceRow
            key={control.key}
            control={control}
            value={prefs[control.key]}
            isMobile={isMobile}
          />
        ))}
        <BubbleAnimationRow value={prefs.bubbleAnimation} isMobile={isMobile} />
      </div>
      <button
        type="button"
        onClick={resetAppearancePreferences}
        className={isMobile
          ? 'settings-btn-secondary'
          : 'rounded-xl border border-lc-border bg-lc-black px-3 py-1.5 text-sm text-lc-white transition hover:bg-lc-border/40'}
      >
        Reset appearance
      </button>
    </div>
  );
}

function ColorPreferenceRow({
  control,
  value,
  isMobile,
}: {
  control: { key: AppearanceKey; label: string; description: string; testId: string };
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
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-2xl border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>{control.label}</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>{control.description}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="color"
          aria-label={`${control.label} color`}
          value={value}
          onChange={(e) => commit(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-xl border border-lc-border bg-transparent p-0"
        />
        <input
          type="text"
          inputMode="text"
          spellCheck={false}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          data-testid={control.testId}
          aria-label={`${control.label} hex color`}
          className={isMobile
            ? 'appearance-hex-input'
            : 'w-24 rounded-xl border border-lc-border bg-lc-dark px-2 py-1.5 font-mono text-xs text-lc-white outline-none focus:border-lc-green'}
          placeholder={APPEARANCE_DEFAULTS[control.key]}
        />
        {!isMobile && (
          <div className="flex flex-wrap gap-1.5" aria-label={`${control.label} quick colors`}>
            {DESKTOP_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                aria-label={`Set ${control.label} color to ${preset.name}`}
                onClick={() => commit(preset.value)}
                className={`h-6 w-6 rounded-full border transition hover:scale-110 ${value === preset.value ? 'border-lc-white ring-2 ring-lc-green/40' : 'border-lc-border'}`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


const BUBBLE_ANIMATION_OPTIONS = [
  { value: 'float', label: 'Float up' },
  { value: 'drift', label: 'Slow drift' },
  { value: 'orbit', label: 'Orbit' },
  { value: 'still', label: 'Still' },
] as const;

function BubbleAnimationRow({ value, isMobile }: { value: Preferences['bubbleAnimation']; isMobile: boolean }) {
  return (
    <div className={isMobile ? 'settings-row appearance-row' : 'rounded-2xl border border-lc-border bg-lc-black/40 p-3'}>
      <div className={isMobile ? 'appearance-row-copy' : 'mb-2'}>
        <div className={isMobile ? '' : 'text-sm font-medium text-lc-white'}>Bubble motion</div>
        <div className={isMobile ? 'settings-row-meta muted' : 'mt-0.5 text-xs text-lc-muted'}>
          Animation style for the decorative background bubbles
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => setPreference('bubbleAnimation', e.target.value as Preferences['bubbleAnimation'])}
        data-testid="appearance-bubble-animation"
        aria-label="Bubble animation style"
        className={isMobile
          ? 'appearance-select'
          : 'w-full rounded-xl border border-lc-border bg-lc-dark px-2 py-1.5 text-xs text-lc-white outline-none focus:border-lc-green'}
      >
        {BUBBLE_ANIMATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}
