'use client';

import { useEffect, useState } from 'react';
import { initializeWot, useWotStore, wotEngine } from '@/lib/wot';
import { WOT_TIERS } from '@/lib/wot/colors';

/**
 * WoT controls — toggle, max-hops slider, live extension status. Reads
 * from `useWotStore` and drives the engine config through its setters.
 *
 * The probe runs on mount + whenever the tab regains focus (via
 * `initializeWot`'s visibilitychange listener).
 */
export default function WotSettings() {
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

  return (
    <section className="space-y-3 rounded-xl border border-lc-border bg-lc-dark p-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-lc-white">Web of Trust</div>
          <div className="mt-0.5 text-xs text-lc-muted">
            Drop events authored by accounts outside your social graph before they reach the cache.
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && canEnable}
          disabled={!canEnable}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled && canEnable ? 'bg-lc-green' : 'bg-lc-border'} disabled:opacity-50`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-lc-black transition-transform ${enabled && canEnable ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </header>

      <div className="flex items-center gap-2 text-xs">
        <span className={statusTone}>● {statusLabel}</span>
        <button
          type="button"
          onClick={() => void refreshStatus()}
          className="text-lc-muted underline-offset-2 hover:text-lc-white hover:underline"
        >
          re-check
        </button>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
          <span>Max hops</span>
          <span className="font-mono text-lc-white">{maxHops}°</span>
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={1}
          value={maxHops}
          onChange={(e) => setMaxHops(Number(e.target.value))}
          className="w-full accent-lc-green"
        />
        <div className="mt-1 text-[11px] text-lc-muted">
          1° = direct follows only · 2° = friends of follows · higher = wider net.
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-lc-muted">
          <span>Min trust paths</span>
          <span className="font-mono text-lc-white">{minPaths}</span>
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={1}
          value={minPaths}
          onChange={(e) => setMinPaths(Number(e.target.value))}
          className="w-full accent-lc-green"
        />
        <div className="mt-1 text-[11px] text-lc-muted">
          Require this many independent follow paths before trusting a pubkey.
          Higher values reject single-shill follows; only effective when the
          extension reports path counts.
        </div>
      </div>

      {/* Color legend — channels in the rail are colored by the closest
          principal's hop distance. */}
      <div className="rounded-md border border-lc-border bg-lc-black/40 p-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
          Channel colors
        </div>
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
            <span className="inline-block w-8 text-center rounded-full border border-lc-border px-1 py-0 font-mono text-[10px] text-lc-muted">—</span>
            <span className="flex-1 text-lc-muted">Out of WoT or unresolved</span>
          </li>
        </ul>
      </div>

      {enabled && canEnable && (
        <div className="rounded-md border border-lc-border bg-lc-black/40 p-2 text-[11px] font-mono text-lc-muted">
          <div className="flex justify-between">
            <span>resolved allow</span>
            <span className="text-lc-green">{stats.allow}</span>
          </div>
          <div className="flex justify-between">
            <span>resolved deny</span>
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
