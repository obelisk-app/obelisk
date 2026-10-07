'use client';

import { useTranslations } from 'next-intl';
import Range from '@/components/ui/forms/Range';
import Toggle from '@/components/ui/forms/Toggle';
import TextButton from '@/components/ui/buttons/TextButton';
import { useWotSettings } from '@/hooks/settings/privacy/useWotSettings';
import WotLegend from './WotLegend';
import WotStatsPanel from './WotStatsPanel';

/**
 * WoT controls: toggle, max-hops slider, live extension status. Reads
 * from `useWotStore` and drives the engine config through its setters
 * (`useWotSettings`).
 */
export default function WotSettings() {
  const t = useTranslations();
  const vm = useWotSettings();

  return (
    <section className="space-y-3 rounded-xl border border-lc-border bg-lc-dark p-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-lc-white">{t('settings.wot.title')}</div>
          {vm.active && (
            <div className="mt-0.5 text-xs text-lc-muted">
              {t('settings.wot.help')}
            </div>
          )}
        </div>
        <Toggle
          aria-label={t('settings.wot.title')}
          checked={vm.active}
          disabled={!vm.canEnable}
          onChange={vm.toggle}
        />
      </header>

      <div className="flex items-center gap-2 text-xs">
        <span className={vm.status.toneClass}>● {t(vm.status.labelKey)}</span>
        <TextButton tone="muted"
          onClick={vm.recheck}
        >
          {t('settings.wot.recheck')}
        </TextButton>
      </div>

      {vm.active && (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
              <span>{t('settings.wot.maxHops')}</span>
              <span className="font-mono text-lc-white">{vm.maxHops}°</span>
            </div>
            <Range
              aria-label={t('settings.wot.maxHops')}
              min={1}
              max={4}
              step={1}
              value={vm.maxHops}
              onChange={(e) => vm.setMaxHops(e.target.value)}
            />
            <div className="mt-1 text-[11px] text-lc-muted">
              {t('settings.wot.hopsHelp')}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
              <span>{t('settings.wot.minPaths')}</span>
              <span className="font-mono text-lc-white">{vm.minPaths}</span>
            </div>
            <Range
              aria-label={t('settings.wot.minPaths')}
              min={1}
              max={3}
              step={1}
              value={vm.minPaths}
              onChange={(e) => vm.setMinPaths(e.target.value)}
            />
            <div className="mt-1 text-[11px] text-lc-muted">
              {t('settings.wot.pathsHelp')}
            </div>
          </div>

          <WotLegend />
        </>
      )}
      {vm.active && <WotStatsPanel stats={vm.stats} />}
    </section>
  );
}
