/** Findings, grouped by the numbered checks of the SEO audit. */

import fs from 'node:fs';

export const CHECKS = {
  status: '1 status/redirects',
  lang: '2 html lang',
  text: '3 title/description',
  canonical: '4 canonical',
  hreflang: '5 hreflang',
  social: '6 open graph/twitter',
  jsonld: '7 json-ld',
  robots: '8 robots',
  sitemap: '9 sitemap',
  head: '10 manifest/icons/viewport',
} as const;

export type Check = (typeof CHECKS)[keyof typeof CHECKS];
export type Finding = { url: string; check: Check; message: string };

export class Report {
  readonly failures: Finding[] = [];
  readonly notes: Finding[] = [];
  readonly passed = new Map<Check, number>();
  pages = 0;

  fail(url: string, check: Check, message: string): void {
    this.failures.push({ url, check, message });
  }

  note(url: string, check: Check, message: string): void {
    if (!this.notes.some((n) => n.check === check && n.message === message)) this.notes.push({ url, check, message });
  }

  /** `cond` true is a pass, false a failure; returns `cond` so callers can stop early. */
  expect(cond: boolean, url: string, check: Check, message: string): boolean {
    if (cond) this.passed.set(check, (this.passed.get(check) ?? 0) + 1);
    else this.fail(url, check, message);
    return cond;
  }

  print(): void {
    const byCheck = new Map<Check, Finding[]>();
    for (const f of this.failures) byCheck.set(f.check, [...(byCheck.get(f.check) ?? []), f]);
    for (const check of Object.values(CHECKS)) {
      const fails = byCheck.get(check) ?? [];
      console.log(`${fails.length ? 'FAIL' : 'ok  '} ${check}: ${this.passed.get(check) ?? 0} passed, ${fails.length} failed`);
      for (const f of fails.slice(0, 40)) console.log(`       ${f.url}: ${f.message}`);
      if (fails.length > 40) console.log(`       ... and ${fails.length - 40} more`);
    }
    if (this.notes.length) {
      console.log('\nNotes (not failures):');
      for (const n of this.notes) console.log(`  ${n.check}: ${n.message} (${n.url})`);
    }
    console.log(`\n${this.pages} URLs crawled, ${this.failures.length} failures.`);
  }

  /** Every failure and note as JSON, for the audit write-up. */
  write(file: string): void {
    fs.writeFileSync(file, JSON.stringify({ pages: this.pages, failures: this.failures, notes: this.notes }, null, 1));
  }
}
