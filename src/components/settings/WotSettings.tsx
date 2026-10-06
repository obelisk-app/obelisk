'use client';

import { useEffect, useState } from 'react';
import { initializeWot, useWotStore, wotEngine } from '@/services/wot';
import { WOT_TIERS } from '@/services/wot/colors';
import { useTranslations } from 'next-intl';
import Range from '@/components/ui/Range';
import Toggle from '@/components/ui/Toggle';
import Text from '@/components/ui/Text';
import TextButton from '@/components/ui/TextButton';

/**
 * WoT controls: toggle, max-hops slider, live extension status. Reads
 * from `useWotStore` and drives the engine config through its setters.
 *
 * The probe runs on mount + whenever the tab regains focus (via
 * `initializeWot`'s visibilitychange listener).
 */
export default function WotSettings() {
  const t = useTranslations();
  const enabled = useWotStore((s) => s.enabled);
  const maxHops = useWotStore((s) => s.maxHops);
  const minPaths = useWotStore((s) => s.minPaths);
  const status = useWotStore((s) => s.status);
  const setEnabled = useWotStore((s) => s.setEnabled);
  const setMaxHops = useWotStore((s) => s.setMaxHops);
  const setMinPaths = useWotStore((s) => s.setMinPaths);
  const refreshStatus = useWotStore((s) => s.refreshStatus);

  useEffect(() => {
    initializeWot();
  }, []);

  const [stats, setStats] = useState(() => wotEngine.stats());
  useEffect(() => {
    const refresh = () => setStats(wotEngine.stats());
    refresh();
    const a = wotEngine.on('verdicts-changed', refresh);
    const t = setInterval(refresh, 1500);
    return () => { a(); clearInterval(t); };
  }, []);

  const statusLabel =
    status === 'configured' ? 'Extension detected' :
    status === 'error' ? 'Extension error' :
    'No nostr-wot extension';
  const statusTone =
    status === 'configured' ? 'text-lc-green' :
    status === 'error' ? 'text-red-400' :
    'text-lc-muted';

  const canEnable = status === 'configured';
  const active = enabled && canEnable;

  return (
    <section className="space-y-3 rounded-xl border border-lc-border bg-lc-dark p-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-lc-white">{t('settings.wot.title')}</div>
          {active && (
            <div className="mt-0.5 text-xs text-lc-muted">
              {t('settings.wot.help')}
            </div>
          )}
        </div>
        <Toggle
          aria-label={t('settings.wot.title')}
          checked={active}
          disabled={!canEnable}
          onChange={() => setEnabled(!enabled)}
        />
      </header>

      <div className="flex items-center gap-2 text-xs">
        <span className={statusTone}>● {statusLabel}</span>
        <TextButton tone="muted"
          onClick={() => void refreshStatus()}
        >
          re-check
        </TextButton>
      </div>

      {active && (
        <>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
              <span>{t('settings.wot.maxHops')}</span>
              <span className="font-mono text-lc-white">{maxHops}°</span>
            </div>
            <Range
              aria-label={t('settings.wot.maxHops')}
              min={1}
              max={4}
              step={1}
              value={maxHops}
              onChange={(e) => setMaxHops(Number(e.target.value))}
            />
            <div className="mt-1 text-[11px] text-lc-muted">
              1° = direct follows only · 2° = friends of follows · higher = wider net.
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
              <span>{t('settings.wot.minPaths')}</span>
              <span className="font-mono text-lc-white">{minPaths}</span>
            </div>
            <Range
              aria-label={t('settings.wot.minPaths')}
              min={1}
              max={3}
              step={1}
              value={minPaths}
              onChange={(e) => setMinPaths(Number(e.target.value))}
            />
            <div className="mt-1 text-[11px] text-lc-muted">
              Require this many independent follow paths before trusting a pubkey.
              Higher values reject single-shill follows; only effective when the
              extension reports path counts.
            </div>
          </div>

          {/* Color legend: channels in the rail are colored by the closest
              principal's hop distance. */}
          <div className="rounded-md border border-lc-border bg-lc-black/40 p-2">
            <Text as="div" variant="label" size="10" weight="semibold" tone="muted" className="mb-1.5">
              {t('settings.wot.channelColors')}
            </Text>
            <ul className="space-y-1">
              {WOT_TIERS.map((tier) => (
                    <li key={tier.label} className="flex items-center gap-2 text-xs">
                      <span className={`inline-block w-8 text-center rounded-full border px-1 py-0 font-mono text-[10px] ${tier.badgeClass}`}>
                        {tier.label}
                      </span>
                      <span className={`flex-1 ${tier.textClass}`}>{tier.description}</span>
                    </li>
              ))}
              <li className="flex items-center gap-2 text-xs">
                    <span className="inline-block w-8 text-center rounded-full border border-lc-border px-1 py-0 font-mono text-[10px] text-lc-muted">-</span>
                    <span className="flex-1 text-lc-muted">{t('settings.wot.outOfGraph')}</span>
              </li>
            </ul>
          </div>

        </>
      )}
      {active && (
        <div className="rounded-md border border-lc-border bg-lc-black/40 p-2 text-[11px] font-mono text-lc-muted">
          <div className="flex justify-between">
            <span>{t('settings.wot.resolvedAllow')}</span>
            <span className="text-lc-green">{stats.allow}</span>
          </div>
          <div className="flex justify-between">
            <span>{t('settings.wot.resolvedDeny')}</span>
            <span className="text-red-400">{stats.deny}</span>
          </div>
          <div className="flex justify-between">
            <span>pending</span>
            <span className="text-lc-white">{stats.pending}</span>
          </div>
        </div>
      )}
    </section>
  );
}
