/**
 * End-to-end smoke: rehydrate as a fresh nsec identity, connect to
 * `wss://public.obelisk.ar`, find a writable text channel (defaults to
 * `general`, override with `OBELISK_E2E_CHANNEL`), and post a probe
 * message. Logs every signal the client surfaces along the way:
 *
 *   - browser console
 *   - websocket frames (AUTH / CLOSED / NOTICE / OK / EOSE)
 *   - relay-access banner state transitions
 *   - DOM checkpoints for sidebar populate, channel selection, message paint
 *
 * Run against a local dev server:
 *   npm run dev    # in another shell
 *   npm run test:e2e
 *
 * Run against production:
 *   OBELISK_E2E_BASE_URL=https://obelisk.ar npm run test:e2e
 *
 * Use a different channel:
 *   OBELISK_E2E_CHANNEL=general npm run test:e2e
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  findChannelByName,
  firstChannelRow,
  generateIdentity,
  getRelayAccessState,
  logFail,
  logObserved,
  logOk,
  logStep,
  logWarn,
  nsecSession,
  seedSession,
  sendMessageInActiveChannel,
  waitForRelayOk,
  DEFAULT_RELAY,
} from './lib';

const CHANNEL_NAME = process.env.OBELISK_E2E_CHANNEL ?? 'general';
const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;

test('fresh nsec identity logs in, finds a channel, posts a message', async ({ page, context }) => {
  test.setTimeout(120_000);

  // ── 0. Identity & seeding ─────────────────────────────────────────
  logStep(
    'Generate ephemeral identity + seed session',
    'localStorage carries an nsec PersistedSession; bridge.initialize rehydrates without showing the LoginModal.',
  );
  const id = generateIdentity();
  logObserved(`npub  ${id.npub}`);
  logObserved(`nsec  ${id.nsec}  (ephemeral, do not reuse)`);
  logObserved(`relay ${RELAY_URL}`);
  await seedSession(context, nsecSession(id, RELAY_URL));
  logOk('session seeded into localStorage via addInitScript');

  // Capture everything the client emits from this point on.
  attachClientCapture(page);

  // ── 1. Navigate ───────────────────────────────────────────────────
  logStep(
    'Navigate to /app',
    'AppShell mounts past the rehydrate gate (no LoginModal); RelayAccessBanner visible until relay confirms read access.',
  );
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('rehydrating-screen')).toBeHidden({ timeout: 20_000 });
  logOk('rehydrate gate cleared — AppShell mounted');

  // ── 2. Watch relay-access ─────────────────────────────────────────
  logStep(
    'Wait for NIP-42 AUTH + first EOSE',
    "relay-access banner transitions: unknown → authenticating → ok (banner unmounts).",
  );
  const initial = await getRelayAccessState(page);
  logObserved(`initial relay-access = ${initial}`);
  await waitForRelayOk(page, 30_000);
  logOk('relay confirmed read access (banner gone, channelsVisible=true)');

  // ── 3. Sidebar populates ──────────────────────────────────────────
  logStep(
    'Sidebar populates with kind 39000 metadata',
    'at least one channel-row button (rendered as `# <name>`) is visible.',
  );
  const anyChannel = firstChannelRow(page);
  await anyChannel.waitFor({ state: 'visible', timeout: 30_000 });
  const visibleCount = await page.getByRole('button').filter({ hasText: /^#/ }).count();
  logOk(`sidebar shows ${visibleCount} channel row(s)`);

  // ── 4. Open the target channel ────────────────────────────────────
  logStep(
    `Open #${CHANNEL_NAME}`,
    'clicking the channel mounts ChatPanel; the compose form should render once messagesVisible is true.',
  );
  let target;
  try {
    target = await findChannelByName(page, CHANNEL_NAME, 8_000);
    const label = (await target.textContent())?.trim() ?? '(unknown)';
    logObserved(`resolved channel button → "${label}"`);
  } catch {
    logWarn(`#${CHANNEL_NAME} not found in sidebar — falling back to first visible channel`);
    target = anyChannel;
  }
  await target.click();
  // Composer is the strongest signal that ChatPanel is fully wired.
  await page.getByPlaceholder(/^Message #/i).first().waitFor({
    state: 'visible',
    timeout: 15_000,
  });
  logOk('ChatPanel mounted; compose form visible');

  // ── 5. Publish a probe message ────────────────────────────────────
  const probe = `obelisk e2e ping ${new Date().toISOString()} ${id.pkHex.slice(0, 6)}`;
  logStep(
    `Publish a kind 9 message containing "${probe.slice(0, 40)}…"`,
    "bridge.sendMessage signs and publishes via SimplePool; relay echoes the event back so it lands in the scroll within a few hundred ms.",
  );
  try {
    await sendMessageInActiveChannel(page, probe);
    logOk('probe message visible in the scroll — round-trip confirmed');
  } catch (err) {
    logFail(`probe message did not appear: ${(err as Error).message}`);
    // Surface relay-access *now* so the failure log explains why.
    const finalState = await getRelayAccessState(page);
    logObserved(`relay-access on failure = ${finalState}`);
    throw err;
  }

  // ── 6. Final invariant ────────────────────────────────────────────
  logStep(
    'Relay-access still ok after publish',
    "publish path doesn't downgrade access; banner stays unmounted.",
  );
  const final = await getRelayAccessState(page);
  expect(final).toBe('ok');
  logOk(`relay-access = ${final}`);
});
