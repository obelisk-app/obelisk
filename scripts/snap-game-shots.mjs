/**
 * Photographs the real game components for the game guides.
 *
 * The heroes and diagrams in `snap-guide-svgs.ts` are drawings; these are
 * screenshots. The difference matters for the games: a hand-drawn board can
 * claim anything, while a capture of `/dev/game-shots` is the shipped engine
 * rendering a board it derived from a kind 2390 log (see the fixtures next to
 * that route). If a rule changes, re-running this changes the pictures.
 *
 * Run (a dev server must be up):
 *   npm run dev
 *   npm run snap-games
 *
 * Target another server with OBELISK_SHOTS_BASE_URL.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.OBELISK_SHOTS_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = join(process.cwd(), 'public', 'og', 'guides', 'games');

/** Element shots, in the order the harness lays them out. */
const SHOTS = [
  'chain-reaction-board',
  'chain-reaction-result',
  'vesta-board',
  'stacker-well',
  'stacker-table',
];

/**
 * Stacker starts empty. Rather than fake a stack, play one: the runner is
 * listening for real keystrokes, so a scripted burst of drops builds a real
 * well the same way a person would, only worse.
 */
async function playStacker(page) {
  const board = page.locator('[data-shot="stacker-table"]');
  await board.scrollIntoViewIfNeeded();
  await page.mouse.click(20, 20); // focus the document, not a control

  // Sweep left to right rather than dropping everything down one column: a
  // tower tops out in a dozen pieces and the picture becomes a death screen.
  const dead = page.locator('[data-shot="stacker-table"] [data-testid="stacker-dead"]');
  for (let i = 0; i < 8; i++) {
    if (await dead.count()) break;
    for (let l = 0; l < 6; l++) await page.keyboard.press('ArrowLeft'); // to the wall
    for (let r = 0; r < i % 9; r++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space'); // hard drop
    await page.waitForTimeout(80);
  }

  // Let the lock animation and the stats rail settle before the shutter.
  await page.waitForTimeout(400);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    // No sound from a screenshot run.
    permissions: [],
  });

  /**
   * Mute the game before it mounts. The music credit line names whichever
   * track the shuffled playlist landed on, so an unmuted run has a caption
   * that changes under the shutter — Playwright waits for the element to stop
   * moving, and the shot is different every time. Muted, the line is not
   * rendered at all.
   */
  await page.addInitScript(() => {
    localStorage.setItem('obelisk-dex/stacker/audio', JSON.stringify({ muted: true, music: false }));
  });

  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));

  const url = `${BASE}/dev/game-shots`;
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  if (!res || !res.ok()) {
    throw new Error(`${url} responded ${res ? res.status() : 'nothing'} — is \`npm run dev\` running?`);
  }
  await page.waitForSelector('[data-shots-ready]', { timeout: 30_000 });
  // Fonts decide layout; capturing before they land shifts every label.
  await page.evaluate(() => document.fonts.ready);

  await playStacker(page);

  const written = [];
  for (const name of SHOTS) {
    const el = page.locator(`[data-shot="${name}"]`);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const path = join(OUT_DIR, `${name}.png`);
    const buf = await el.screenshot({ path, animations: 'disabled' });
    written.push([name, buf.length]);
  }

  // The picker is a modal, so it goes last: it covers everything else.
  await page.click('[data-open-picker]');
  const panel = page.locator('[data-testid="new-game-modal"] > div');
  await panel.waitFor({ timeout: 10_000 });
  await page.waitForTimeout(250);
  const pickerBuf = await panel.screenshot({
    path: join(OUT_DIR, 'game-picker.png'),
    animations: 'disabled',
  });
  written.push(['game-picker', pickerBuf.length]);

  await browser.close();

  const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
  for (const [name, bytes] of written) {
    console.log(`  ${name.padEnd(24)} ${kb(bytes)}`);
  }
  if (errors.length) {
    console.warn(`\n${errors.length} page error(s) during capture:`);
    for (const e of errors.slice(0, 5)) console.warn(`  ${e}`);
  }
  console.log(`\nWrote ${written.length} screenshots to public/og/guides/games/`);

  // A manifest so the guide asset metadata and the script cannot drift apart.
  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ base: BASE, shots: written.map(([n]) => n) }, null, 2)}\n`,
    'utf8',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
