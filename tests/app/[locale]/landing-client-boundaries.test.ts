import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildImportGraph, staticClosure } from '@tests/support/import-graph';

const page = 'src/app/[locale]/page.tsx';
const staticSections = [
  'LandingHero', 'HeroProductPreview', 'LandingHeroAnimation', 'PreviewSection',
  'FeaturesSection', 'StepsSection', 'RoadmapSection', 'RoadmapPhase',
  'LearnSection', 'StackSection', 'CtaSection', 'FaqSection', 'DemoVideoSection',
];

describe('landing client boundaries', () => {
  it('keeps static landing sections outside every reachable client import tree', () => {
    const graph = buildImportGraph();
    const reachable = [...staticClosure(graph, page)];
    const clients = reachable.filter((file) => file.startsWith('src/') && /^(?:'use client'|"use client");/m.test(readFileSync(file, 'utf8')));
    const shipped = new Set(clients.flatMap((file) => [...staticClosure(graph, file)]));
    for (const section of staticSections) {
      const file = `src/components/marketing/landing/${section}.tsx`;
      expect(reachable).toContain(file);
      expect(shipped, `${section} belongs on the server`).not.toContain(file);
    }
    expect(shipped).not.toContain('src/constants/marketing/landing.ts');
  });

  it('owns the page composition directly and retains explicit app navigation', () => {
    const source = readFileSync(page, 'utf8');
    expect(source).toContain('<main');
    expect(source).toContain('marketing.pqc.heading');
    expect(source).not.toContain('LandingPage');
    for (const section of ['LandingHero', 'PreviewSection', 'CtaSection']) {
      const source = readFileSync(`src/components/marketing/landing/${section}.tsx`, 'utf8');
      expect(source).toMatch(/href="\/app"\s+prefetch=\{false\}/);
    }
  });
});
