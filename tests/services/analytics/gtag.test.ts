import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GA_MEASUREMENT_ID,
  GTAG_SRC,
  analyticsLoaded,
  removeAnalyticsCookies,
  startAnalytics,
  stopAnalytics,
} from '@/services/analytics/gtag';
import { googleScripts, optedOut, resetAnalyticsPage, simulateGtagCookies } from '@tests/support/analytics';

beforeEach(resetAnalyticsPage);

describe('gtag.js loading', () => {
  it('adds one async script from googletagmanager and queues js + config as arguments objects', () => {
    startAnalytics();
    const scripts = googleScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(GTAG_SRC);
    expect(scripts[0].async).toBe(true);
    const queue = (window as unknown as { dataLayer: IArguments[] }).dataLayer;
    expect(queue.map((entry) => Array.from(entry)[0])).toEqual(['js', 'config']);
    expect(Array.from(queue[1])[1]).toBe(GA_MEASUREMENT_ID);
    // gtag.js ignores plain arrays: each entry must be an arguments object.
    expect(Object.prototype.toString.call(queue[0])).toBe('[object Arguments]');
    expect(optedOut()).toBe(false);
  });

  it('loads at most once per page', () => {
    startAnalytics();
    startAnalytics();
    expect(googleScripts()).toHaveLength(1);
    expect((window as unknown as { dataLayer: unknown[] }).dataLayer).toHaveLength(2);
  });

  it('stop sets the opt-out flag and deletes the _ga cookies, leaving other cookies', () => {
    document.cookie = 'locale=es; Path=/';
    startAnalytics();
    simulateGtagCookies();
    stopAnalytics();
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toContain('locale=es');
  });

  it('start after stop lifts the opt-out without a second script', () => {
    startAnalytics();
    stopAnalytics();
    startAnalytics();
    expect(optedOut()).toBe(false);
    expect(googleScripts()).toHaveLength(1);
    expect(analyticsLoaded()).toBe(true);
  });

  it('removing the cookies touches only _ga and _ga_<id>', () => {
    document.cookie = '_gat=1; Path=/';
    simulateGtagCookies();
    removeAnalyticsCookies();
    expect(document.cookie).toBe('_gat=1');
  });
});

describe('where Google Analytics may appear in the source', () => {
  const SRC = join(process.cwd(), 'src');
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(?:ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
  }

  it('only the consent-gated module loads gtag.js; no layout or page carries it', () => {
    const loaders = walk(SRC)
      .filter((p) => /googletagmanager\.com\/gtag|gtag\(\s*['"]config/.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p));
    expect(loaders).toEqual(['services/analytics/gtag.ts']);
  });
});
