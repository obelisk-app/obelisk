import { describe, expect, it } from 'vitest';
import { buildSeedHistory, decideSnap, decideSwipeNav, NAV_ORDER, neighborsFor } from './swipe-nav';
import { initialNav, type NavState } from './url-state';

describe('mobile swipe-nav', () => {
  describe('top-level screens cycle through NAV_ORDER', () => {
    it('swipe-left from server goes to dms-list', () => {
      expect(decideSwipeNav('server', false)).toEqual({
        kind: 'top-level',
        target: 'dms-list',
        dir: 'forward',
      });
    });

    it('swipe-right from server is a no-op (already first tab)', () => {
      expect(decideSwipeNav('server', true)).toEqual({ kind: 'noop' });
    });

    it('swipe-right from dms-list goes back to server', () => {
      expect(decideSwipeNav('dms-list', true)).toEqual({
        kind: 'top-level',
        target: 'server',
        dir: 'back',
      });
    });

    it('swipe-left from inbox goes to settings-profile', () => {
      expect(decideSwipeNav('inbox', false)).toEqual({
        kind: 'top-level',
        target: 'settings-profile',
        dir: 'forward',
      });
    });

    it('swipe-left from settings-profile is a no-op (last tab)', () => {
      expect(decideSwipeNav('settings-profile', false)).toEqual({ kind: 'noop' });
    });
  });

  describe('sub-screens of server: horizontal swipe always switches tabs (skips parent)', () => {
    it('swipe-right from channel is a no-op (server parent is first tab)', () => {
      expect(decideSwipeNav('channel', true)).toEqual({ kind: 'noop' });
    });

    it('swipe-left from channel jumps to dms-list (past server parent)', () => {
      expect(decideSwipeNav('channel', false)).toEqual({
        kind: 'top-level',
        target: 'dms-list',
        dir: 'forward',
      });
    });

    it('swipe-left from voice-room jumps to dms-list', () => {
      expect(decideSwipeNav('voice-room', false)).toEqual({
        kind: 'top-level',
        target: 'dms-list',
        dir: 'forward',
      });
    });

    it('swipe-right from voice-room is a no-op', () => {
      expect(decideSwipeNav('voice-room', true)).toEqual({ kind: 'noop' });
    });

    it('swipe-left from forum jumps to dms-list', () => {
      expect(decideSwipeNav('forum', false)).toEqual({
        kind: 'top-level',
        target: 'dms-list',
        dir: 'forward',
      });
    });

    it('swipe-right from forum is a no-op', () => {
      expect(decideSwipeNav('forum', true)).toEqual({ kind: 'noop' });
    });

    it('swipe-left from member-list jumps to dms-list', () => {
      expect(decideSwipeNav('member-list', false)).toEqual({
        kind: 'top-level',
        target: 'dms-list',
        dir: 'forward',
      });
    });

    it('swipe-right from member-list is a no-op', () => {
      expect(decideSwipeNav('member-list', true)).toEqual({ kind: 'noop' });
    });
  });

  describe('sub-screens of dms-list', () => {
    it('swipe-right from dm-thread jumps to server (before dms-list parent)', () => {
      expect(decideSwipeNav('dm-thread', true)).toEqual({
        kind: 'top-level',
        target: 'server',
        dir: 'back',
      });
    });

    it('swipe-left from dm-thread jumps to inbox (past dms-list parent)', () => {
      expect(decideSwipeNav('dm-thread', false)).toEqual({
        kind: 'top-level',
        target: 'inbox',
        dir: 'forward',
      });
    });

    it('swipe-right from compose-dm jumps to server', () => {
      expect(decideSwipeNav('compose-dm', true)).toEqual({
        kind: 'top-level',
        target: 'server',
        dir: 'back',
      });
    });

    it('swipe-left from compose-dm jumps to inbox', () => {
      expect(decideSwipeNav('compose-dm', false)).toEqual({
        kind: 'top-level',
        target: 'inbox',
        dir: 'forward',
      });
    });
  });

  describe('settings-prefs is a sub of settings-profile (last tab)', () => {
    it('swipe-right jumps to inbox (before settings-profile parent)', () => {
      expect(decideSwipeNav('settings-prefs', true)).toEqual({
        kind: 'top-level',
        target: 'inbox',
        dir: 'back',
      });
    });

    it('swipe-left is a no-op (no tab past settings-profile)', () => {
      expect(decideSwipeNav('settings-prefs', false)).toEqual({ kind: 'noop' });
    });
  });

  describe('profile-edit is a sub of settings-profile', () => {
    it('swipe-right jumps to inbox', () => {
      expect(decideSwipeNav('profile-edit', true)).toEqual({
        kind: 'top-level',
        target: 'inbox',
        dir: 'back',
      });
    });

    it('swipe-left is a no-op (no tab past settings-profile)', () => {
      expect(decideSwipeNav('profile-edit', false)).toEqual({ kind: 'noop' });
    });

    it('neighbors: left = inbox, right = null', () => {
      expect(neighborsFor('profile-edit')).toEqual({ left: 'inbox', right: null });
    });
  });

  describe('untyped / standalone screens', () => {
    it('login screen is a no-op in either direction', () => {
      expect(decideSwipeNav('login', true)).toEqual({ kind: 'noop' });
      expect(decideSwipeNav('login', false)).toEqual({ kind: 'noop' });
    });
  });

  it('NAV_ORDER has exactly the 4 expected top-level tabs', () => {
    expect(NAV_ORDER).toEqual(['server', 'dms-list', 'inbox', 'settings-profile']);
  });

  describe('neighborsFor — drag-carousel reveal', () => {
    it('first top-level tab has no left neighbor', () => {
      expect(neighborsFor('server')).toEqual({ left: null, right: 'dms-list' });
    });

    it('middle top-level tabs have both neighbors', () => {
      expect(neighborsFor('dms-list')).toEqual({ left: 'server', right: 'inbox' });
      expect(neighborsFor('inbox')).toEqual({ left: 'dms-list', right: 'settings-profile' });
    });

    it('last top-level tab has no right neighbor', () => {
      expect(neighborsFor('settings-profile')).toEqual({ left: 'inbox', right: null });
    });

    it('sub-screen of server: no left (parent is first tab), right = next top-level', () => {
      expect(neighborsFor('channel')).toEqual({ left: null, right: 'dms-list' });
      expect(neighborsFor('voice-room')).toEqual({ left: null, right: 'dms-list' });
      expect(neighborsFor('member-list')).toEqual({ left: null, right: 'dms-list' });
      expect(neighborsFor('forum')).toEqual({ left: null, right: 'dms-list' });
    });

    it('sub-screen of dms-list: left = server, right = inbox', () => {
      expect(neighborsFor('dm-thread')).toEqual({ left: 'server', right: 'inbox' });
      expect(neighborsFor('compose-dm')).toEqual({ left: 'server', right: 'inbox' });
    });

    it('settings-prefs: left = inbox, right = null (last tab)', () => {
      expect(neighborsFor('settings-prefs')).toEqual({ left: 'inbox', right: null });
    });

    it('untyped screens have no neighbors', () => {
      expect(neighborsFor('login')).toEqual({ left: null, right: null });
      expect(neighborsFor('profile-setup')).toEqual({ left: null, right: null });
    });
  });

  describe('buildSeedHistory — initial popstate seeding', () => {
    it('top-level tab seeds [guard, parsed] only', () => {
      const parsed: NavState = { ...initialNav, screen: 'server' };
      const entries = buildSeedHistory(parsed, null);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ state: { guard: true }, url: '/app' });
      expect(entries[1]).toEqual({ state: { nav: parsed }, url: '/app' });
    });

    it('top-level inbox: guard sits behind, no parent in between', () => {
      const parsed: NavState = { ...initialNav, screen: 'inbox' };
      const entries = buildSeedHistory(parsed, null);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({ state: { guard: true }, url: '/app?s=inbox' });
      expect(entries[1].state.nav?.screen).toBe('inbox');
    });

    it('deep-linked channel seeds [guard, server, channel] so back climbs to the channel list', () => {
      const parsed: NavState = { ...initialNav, screen: 'channel', groupId: 'gid' };
      const entries = buildSeedHistory(parsed, null);
      expect(entries).toHaveLength(3);
      expect(entries[0].state).toEqual({ guard: true });
      expect(entries[1].state.nav?.screen).toBe('server');
      expect(entries[1].state.nav?.groupId).toBe(null);
      expect(entries[2].state.nav).toEqual(parsed);
      // Guard URL matches the parent's URL so the popstate re-push doesn't
      // flicker the address bar.
      expect(entries[0].url).toBe(entries[1].url);
      expect(entries[2].url).toBe('/app?c=gid&s=channel');
    });

    it('deep-linked dm-thread seeds dms-list as the parent', () => {
      const parsed: NavState = { ...initialNav, screen: 'dm-thread', dmPeer: 'pk' };
      const entries = buildSeedHistory(parsed, null);
      expect(entries).toHaveLength(3);
      expect(entries[1].state.nav?.screen).toBe('dms-list');
      expect(entries[1].state.nav?.dmPeer).toBe(null);
      expect(entries[2].state.nav).toEqual(parsed);
    });

    it('deep-linked settings-prefs seeds settings-profile as the parent', () => {
      const parsed: NavState = { ...initialNav, screen: 'settings-prefs' };
      const entries = buildSeedHistory(parsed, null);
      expect(entries).toHaveLength(3);
      expect(entries[1].state.nav?.screen).toBe('settings-profile');
      expect(entries[2].state.nav?.screen).toBe('settings-prefs');
    });

    it('relay query param is preserved on every seeded URL', () => {
      const parsed: NavState = { ...initialNav, screen: 'channel', groupId: 'gid' };
      const entries = buildSeedHistory(parsed, 'wss://relay.obelisk.ar');
      for (const e of entries) {
        expect(e.url).toContain('relay=relay.obelisk.ar');
      }
    });
  });

  describe('decideSnap — drag-release commit/revert decision', () => {
    const W = 400; // viewport width

    it('zero dx never commits', () => {
      expect(decideSnap(0, 0, W)).toBe('revert');
      expect(decideSnap(0, 1.0, W)).toBe('revert');
    });

    it('commits when dragged past 1/3 of viewport', () => {
      expect(decideSnap(W / 3 + 1, 0, W)).toBe('commit');
      expect(decideSnap(-(W / 3 + 1), 0, W)).toBe('commit');
    });

    it('reverts when dragged less than 1/3 with no flick', () => {
      expect(decideSnap(W / 4, 0, W)).toBe('revert');
      expect(decideSnap(-(W / 4), 0, W)).toBe('revert');
    });

    it('flicks commit even with small displacement when direction agrees', () => {
      expect(decideSnap(30, 0.6, W)).toBe('commit');
      expect(decideSnap(-30, -0.6, W)).toBe('commit');
    });

    it('flicks reverse-direction (against drag) revert', () => {
      expect(decideSnap(30, -0.6, W)).toBe('revert');
      expect(decideSnap(-30, 0.6, W)).toBe('revert');
    });

    it('slow drag below velocity threshold reverts even with direction agreement', () => {
      expect(decideSnap(30, 0.3, W)).toBe('revert');
    });

    it('zero or negative width reverts safely', () => {
      expect(decideSnap(100, 0, 0)).toBe('revert');
      expect(decideSnap(100, 0, -10)).toBe('revert');
    });
  });
});
