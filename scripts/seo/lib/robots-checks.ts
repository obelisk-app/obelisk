/**
 * Check 8 (robots.txt) and check 10 (the web app manifest): robots.txt
 * points at the sitemap, keeps crawlers out of the API and the dev harness,
 * and blocks nothing that must be indexed; the manifest parses and its
 * icons answer at the sizes it declares.
 */

import { SITE } from './expect';
import { get } from './http';
import { imageSize } from './image-size';
import { CHECKS as C, type Report } from './report';

type Rule = { allow: boolean; pattern: string };

/** The `User-agent: *` group's rules, in file order. */
export function parseRobots(txt: string): { rules: Rule[]; sitemaps: string[]; unknown: string[] } {
  const rules: Rule[] = [];
  const sitemaps: string[] = [];
  const unknown: string[] = [];
  let inStar = false;
  for (const raw of txt.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') inStar = value === '*';
    else if (key === 'sitemap') sitemaps.push(value);
    else if ((key === 'allow' || key === 'disallow') && inStar) rules.push({ allow: key === 'allow', pattern: value });
    else if (key !== 'allow' && key !== 'disallow') unknown.push(key);
  }
  return { rules, sitemaps, unknown };
}

/** Google's matching: the longest matching rule wins, Allow on a tie; `*` and `$` supported. */
export function isAllowed(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rules) {
    if (!rule.pattern) continue;
    const re = new RegExp(`^${rule.pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$|\$$/, '$')}`);
    if (!re.test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export async function checkRobots(base: string, mustAllow: string[], report: Report): Promise<void> {
  const url = `${SITE}/robots.txt`;
  const res = await get(base, '/robots.txt');
  if (!report.expect(res.status === 200, url, C.robots, `robots.txt answers ${res.status}`)) return;
  report.expect(res.contentType.startsWith('text/plain'), url, C.robots, `content-type ${res.contentType}`);
  const { rules, sitemaps, unknown } = parseRobots(res.text());
  report.expect(sitemaps.length === 1 && sitemaps[0] === `${SITE}/sitemap.xml`, url, C.robots, `Sitemap lines: ${sitemaps.join(', ')}`);
  report.expect(unknown.length === 0, url, C.robots, `non-standard directives: ${unknown.join(', ')}`);
  for (const p of ['/api/', '/api/link-preview', '/dev/', '/dev/game-shots']) report.expect(!isAllowed(rules, p), url, C.robots, `${p} is not disallowed`);
  for (const p of mustAllow) report.expect(isAllowed(rules, p), url, C.robots, `${p} must be crawlable but robots.txt blocks it`);
  // A noindex page must stay crawlable, or the crawler never sees the noindex.
  for (const p of ['/app', '/voice', '/r/lacrypta', '/notes/x', '/p/x', '/t/x', '/es/app']) report.expect(isAllowed(rules, p), url, C.robots, `${p} is blocked, so its noindex can never be read`);
}

export async function checkManifest(base: string, report: Report): Promise<void> {
  const url = `${SITE}/manifest.webmanifest`;
  const res = await get(base, '/manifest.webmanifest');
  if (!report.expect(res.status === 200, url, C.head, `manifest answers ${res.status}`)) return;
  let m: { name?: string; short_name?: string; start_url?: string; lang?: string; icons?: Array<{ src: string; sizes: string; type?: string }> };
  try {
    m = JSON.parse(res.text());
  } catch {
    report.fail(url, C.head, 'manifest is not JSON');
    return;
  }
  for (const key of ['name', 'short_name', 'start_url', 'lang'] as const) report.expect(Boolean(m[key]), url, C.head, `manifest has no ${key}`);
  for (const icon of m.icons ?? []) {
    const ir = await get(base, icon.src);
    const size = imageSize(ir.body);
    report.expect(ir.status === 200 && Boolean(size) && `${size?.width}x${size?.height}` === icon.sizes, url, C.head, `icon ${icon.src}: ${ir.status}, ${size?.width}x${size?.height}, declared ${icon.sizes}`);
  }
}
