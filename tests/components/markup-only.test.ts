import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeSource, KINDS, total, type Counts } from '../../scripts/markup-only/analyze';
import { MULTI_COMPONENT, MULTI_COMPONENT_CEILING } from '../../scripts/markup-only/multi-component';
import { BASELINE_PATH, countsByFile, scanTree } from '../../scripts/markup-only/scan';

/**
 * The owner's rule: a component file is markup. Its state and handlers come
 * from one view-model hook (`src/hooks/<module>/use<Component>.ts`), its data
 * from bridge and store hooks; pure shaping lives in `src/utils/<topic>/`,
 * actions with side effects in `src/services/<topic>/`. The full convention
 * is docs/conventions.md#component-files; the precise rule, read from the
 * syntax tree, is the header of scripts/markup-only/analyze.ts.
 *
 * A ratchet, like the i18n baseline: on 2026-10-07 (round 27) the files
 * under src/components and src/app that break the rule were frozen in
 * tests/components/markup-only-baseline.json, per file and per kind. A new
 * file must follow the rule; a listed file may not get worse in any kind;
 * and a file that got better must be written down (regenerate, never
 * hand-edit), so the room it freed cannot be spent again:
 *
 *   npx tsx scripts/markup-only/baseline.ts
 *   npx tsx scripts/markup-only/baseline.ts --list src/components/voice
 */

const BASELINE = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Record<string, Counts>;
const kinds = (src: string, file = 'src/components/x/Panel.tsx') => analyzeSource(src, file).counts;

describe('component files are markup', () => {
  const counts = countsByFile(scanTree());

  it('finds nothing in a file the baseline does not list', () => {
    const fresh = Object.keys(counts).filter((file) => !(file in BASELINE));
    const detail = fresh.map((file) => `${file} ${JSON.stringify(counts[file])}`);
    expect(detail, 'move the logic into a hook, a util or a service (docs/conventions.md#component-files)').toEqual([]);
  });

  it('does not grow in any kind in a listed file', () => {
    const grew: string[] = [];
    for (const [file, now] of Object.entries(counts)) {
      const allowed = BASELINE[file];
      if (!allowed) continue;
      for (const k of KINDS) {
        if ((now[k] ?? 0) > (allowed[k] ?? 0)) grew.push(`${file} ${k}: ${allowed[k] ?? 0} -> ${now[k]}`);
      }
    }
    expect(grew).toEqual([]);
  });

  it('has a baseline that is still accurate, so it only shrinks', () => {
    const stale: string[] = [];
    for (const [file, allowed] of Object.entries(BASELINE)) {
      for (const k of KINDS) {
        const now = counts[file]?.[k] ?? 0;
        if (now < (allowed[k] ?? 0)) stale.push(`${file} ${k}: ${allowed[k]} -> ${now}`);
      }
    }
    expect(stale, 'regenerate: npx tsx scripts/markup-only/baseline.ts').toEqual([]);
  });

  it('keeps the reasoned multi-component list short and every entry still needed', () => {
    expect(Object.keys(MULTI_COMPONENT).length).toBeLessThanOrEqual(MULTI_COMPONENT_CEILING);
    const unneeded = Object.keys(MULTI_COMPONENT).filter((file) => {
      const report = analyzeSource(readFileSync(file, 'utf8'), file);
      return !report.findings.some((f) => f.kind === 'components');
    });
    expect(unneeded).toEqual([]);
    for (const reason of Object.values(MULTI_COMPONENT)) expect(reason.length).toBeGreaterThan(30);
  });

  it('is looking at the real tree', () => {
    expect(Object.keys(BASELINE).length).toBeGreaterThan(0);
    expect(Object.values(counts).reduce((sum, c) => sum + total(c), 0)).toBeGreaterThan(0);
  });
});

describe('the markup-only rule', () => {
  it('counts effects, memos, callbacks and reducers in a component', () => {
    const src = `export default function Panel() {
      useEffect(() => {}, []);
      React.useLayoutEffect(() => {});
      const a = useMemo(() => 1, []);
      const f = useCallback(() => {}, []);
      const [s, d] = useReducer(r, 0);
      return <div />;
    }`;
    expect(kinds(src)).toEqual({ effects: 2, memos: 2, reducers: 1 });
  });

  it('allows two useState / useRef calls per component, and counts the rest', () => {
    const two = 'export default function P() { const [a] = useState(0); const r = useRef(null); return <i />; }';
    expect(kinds(two)).toEqual({});
    const four = 'export default function P() { useState(0); useState(1); useRef(null); useRef(1); return <i />; }';
    expect(kinds(four)).toEqual({ state: 2 });
  });

  it('allows a handler that calls one function, and a list that maps to markup', () => {
    const src = `export default function P({ vm }) {
      return <ul onClick={() => vm.kick(row)}>
        <input onChange={(e) => vm.setFilter(e.target.value as Role)} />
        <b onClick={() => { vm.close(); }} onKeyDown={() => void vm.save().catch(() => {})} />
        {vm.rows.map((r) => <li key={r.id}>{r.name}</li>)}
      </ul>;
    }`;
    expect(kinds(src)).toEqual({});
  });

  it('counts a handler with logic, a nested function and a top-level helper', () => {
    const src = `const rowKey = (r) => r.a + '/' + r.b;
    export default function P({ vm }) {
      async function bulk() { await vm.go(); }
      return <b onClick={() => { vm.busy(true); vm.go(); }} title={vm.rows.filter((r) => r.on && r.ok).length} />;
    }`;
    expect(analyzeSource(src, 'src/components/x/P.tsx').findings.map((f) => f.what)).toEqual([
      'rowKey', 'bulk', 'onClick', 'inline function',
    ]);
  });

  it('counts every component past the first, nested ones too', () => {
    const src = `export default function A() { const B = () => <i />; return <B />; }
    function C() { return null; }`;
    expect(kinds(src)).toEqual({ components: 2 });
  });

  it('allows a columns factory that only returns a literal of markup', () => {
    const src = `export function columns(t, onToggle) {
      return [
        { key: 'user', header: t('admin.colUser'), cell: (r) => <UserCell pubkey={r.pubkey} /> },
        { key: 'select', header: '', cell: (r) => <SelectCell row={r} onToggle={() => onToggle(r)} /> },
      ];
    }`;
    expect(kinds(src, 'src/components/x/columns.tsx')).toEqual({});
    const logic = 'export function columns(t) { return [{ key: t ? "a" : "b" }]; }';
    expect(kinds(logic, 'src/components/x/columns.tsx')).toEqual({ functions: 1 });
  });

  it('lets a route file export what Next.js requires', () => {
    const page = `export async function generateMetadata() { const x = await f(); return { title: x }; }
    export function generateStaticParams() { return list.map((l) => ({ l })); }
    export default function Page() { return <main />; }`;
    expect(kinds(page, 'src/app/[locale]/x/page.tsx')).toEqual({});
    expect(kinds(page, 'src/components/x/Thing.tsx')).toEqual({ functions: 2 });
    const route = 'export async function GET(req) { if (!req) return null; return 1; }\nfunction helper() { return 1; }';
    expect(kinds(route, 'src/app/api/x/route.ts')).toEqual({ functions: 1 });
    const og = 'export default async function Image() { const f = await load(); return new ImageResponse(<div />); }';
    expect(kinds(og, 'src/app/[locale]/opengraph-image.tsx')).toEqual({});
  });

  it('bites on the real reference panel when logic is pasted back in', () => {
    const file = 'src/components/admin/relay-admin/RelayAdminPanel.tsx';
    const source = readFileSync(file, 'utf8');
    expect(analyzeSource(source, file).counts).toEqual({});
    const regressed = source.replace(
      /return \(/,
      'const shown = useMemo(() => vm.rows.filter((r) => r.isAdmin && r.pubkey), [vm.rows]);\n  return (',
    );
    expect(analyzeSource(regressed, file).counts).toEqual({ memos: 1 });
  });
});
