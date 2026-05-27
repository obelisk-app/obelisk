/**
 * Phase 5 contract: the NIP-59 relay-sync engine converges cursors
 * across devices on the same nsec. Two browser contexts seeded with
 * the same key advance independently; within debounce + grace they
 * converge through `applyRemoteState`.
 *
 * Method:
 *   1. Open context A, log in, click into a channel — `useAutoMarkRead`
 *      advances `groupCursors[groupId]` to the latest message's ts.
 *   2. After ~10s (8s debounce + 2s grace), context B (same nsec, fresh
 *      browser context) reads its persisted store and observes the
 *      advanced cursor.
 */
import { test, expect } from '@playwright/test';
import {
  attachClientCapture,
  DEFAULT_RELAY,
  firstChannelRow,
  generateIdentity,
  logObserved,
  logOk,
  logStep,
  nsecSession,
  readLocalStorageJSON,
  seedSession,
  sendMessageInActiveChannel,
  waitForRelayOk,
} from './lib';

const RELAY_URL = process.env.OBELISK_E2E_RELAY ?? DEFAULT_RELAY;
const READ_STATE_KEY = (pubkey: string) => `obelisk-read-state:${pubkey}`;

interface ReadStatePersist {
  state?: {
    groupCursors?: Record<string, number>;
    dmCursors?: Record<string, number>;
  };
}

test('read-state cursors converge across two contexts on the same nsec', async ({ browser }) => {
  test.setTimeout(90_000);

  const id = generateIdentity();
  logObserved(`shared npub  ${id.npub}`);

  // ── Context A — open a channel, advance the cursor ────────────────
  logStep('Context A — log in, open a channel', `relay=${RELAY_URL}`);
  const ctxA = await browser.newContext();
  await seedSession(ctxA, nsecSession(id, RELAY_URL));
  const pageA = await ctxA.newPage();
  attachClientCapture(pageA, { mirror: false });
  await pageA.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(pageA, 30_000);

  const channelA = firstChannelRow(pageA);
  await channelA.waitFor({ state: 'visible', timeout: 30_000 });
  await channelA.click();

  // Ensure the selected channel has a fresh message. The production relay can
  // legitimately return an empty first channel, in which case auto-mark-read
  // has no timestamp to advance and the convergence assertion is testing a
  // missing fixture rather than the read-state machinery.
  const probe = `read-state convergence ${Date.now()} ${id.pkHex.slice(0, 6)}`;
  await pageA.getByPlaceholder(/^Message #/i).first().waitFor({ state: 'visible', timeout: 15_000 });
  await sendMessageInActiveChannel(pageA, probe);

  // Read the cursor the auto-mark hook should have advanced.
  let preA = await readLocalStorageJSON<ReadStatePersist>(pageA, READ_STATE_KEY(id.pkHex));
  // Auto-mark waits for the user to be "watching" — visibility + focus.
  // In headless Chromium this is usually true but the cursor advance
  // can also wait for messages to arrive. Give it a few seconds.
  for (let i = 0; i < 8; i++) {
    preA = await readLocalStorageJSON<ReadStatePersist>(pageA, READ_STATE_KEY(id.pkHex));
    const cursors = preA?.state?.groupCursors ?? {};
    if (Object.keys(cursors).length > 0) break;
    await pageA.waitForTimeout(1_000);
  }
  const cursorsA = preA?.state?.groupCursors ?? {};
  const advancedEntries = Object.entries(cursorsA).filter(([, v]) => v > 0);
  expect(advancedEntries.length).toBeGreaterThan(0);
  const [advancedGroup, advancedAt] = advancedEntries[0];
  logOk(`context A advanced cursor: ${advancedGroup} → ${advancedAt}`);

  // ── Wait long enough for the 8s debounced publish to fire ─────────
  logStep('Wait for NIP-59 publish + ingest', '~12s = 8s debounce + grace');
  await pageA.waitForTimeout(12_000);

  // ── Context B — fresh browser, same nsec; expect convergence ─────
  logStep('Context B — open with the same nsec; expect cursor convergence', '');
  const ctxB = await browser.newContext();
  await seedSession(ctxB, nsecSession(id, RELAY_URL));
  const pageB = await ctxB.newPage();
  attachClientCapture(pageB, { mirror: false });
  await pageB.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForRelayOk(pageB, 30_000);

  // Poll for up to 12s for context B's store to reflect context A's
  // advance via the relay-sync ingest path.
  let convergedAt: number | null = null;
  for (let i = 0; i < 12; i++) {
    const persisted = await readLocalStorageJSON<ReadStatePersist>(pageB, READ_STATE_KEY(id.pkHex));
    const got = persisted?.state?.groupCursors?.[advancedGroup];
    if (typeof got === 'number' && got >= advancedAt) {
      convergedAt = got;
      break;
    }
    await pageB.waitForTimeout(1_000);
  }
  expect(convergedAt).not.toBeNull();
  logOk(`context B converged on cursor ${advancedGroup} → ${convergedAt} (>= ${advancedAt})`);

  await ctxA.close();
  await ctxB.close();
});
