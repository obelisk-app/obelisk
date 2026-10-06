import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Both shells read a `?relay=` deep link on mount. The only thing either may
 * do with it is hand it to `useRelayDeepLink`, which confirms a relay outside
 * the user's list before anything reaches the bridge. A direct
 * `switchRelay` in that effect is the bug this guards against: one click on
 * a crafted link AUTHs the user to a stranger's relay and pins it to the rail.
 *
 * Source-level on purpose: the behaviour is tested in
 * `src/hooks/chat/useRelayDeepLink.test.tsx`; this pins that the shells
 * actually route through it, so the gate cannot be bypassed by a second copy
 * drifting in one shell (how the SFU guard drifted).
 */
const read = (p: string) =>
  readFileSync(join(process.cwd(), 'src/app/app', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

function deepLinkEffect(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  expect(from, `missing "${start}"`).toBeGreaterThan(-1);
  expect(to, `missing "${end}"`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('deep-link relay gate', () => {
  it('the desktop shell hands ?relay= to useRelayDeepLink and never switches directly', () => {
    // The shell's navigation, deep link included, is `shell/useDesktopNavigation.ts`.
    expect(read('DesktopShell.tsx')).toContain('useDesktopNavigation(relay');
    const shell = read('shell/useDesktopNavigation.ts');
    expect(shell).toContain("import { useRelayDeepLink } from '@/hooks/chat/useRelayDeepLink'");
    const effect = deepLinkEffect(shell, "const r = params.get('relay')", "params.get('s') === 'feed'");
    expect(effect).toContain('switchFromDeepLink(r)');
    expect(effect).not.toContain('switchRelay');
  });

  it('the phone shell hands the parsed relay to useRelayDeepLink and never switches directly', () => {
    // The URL parse and history seeding live in `mobile/useMobileHistorySync.ts`.
    expect(read('mobile/PhoneShell.tsx')).toContain('useMobileHistorySync(');
    const shell = read('mobile/useMobileHistorySync.ts');
    expect(shell).toContain("from '@/hooks/chat/useRelayDeepLink'");
    const effect = deepLinkEffect(shell, 'parseUrl(window.location.search)', 'buildSeedHistory(');
    expect(effect).toContain('switchFromDeepLink(relay)');
    expect(effect).not.toContain('switchRelay');
    // A relay still behind the dialog must not be what a refresh reopens.
    expect(effect).toContain("classifyDeepLinkRelay(relay, currentRelayUrl, configuredRelays) !== 'unknown'");
  });
});
