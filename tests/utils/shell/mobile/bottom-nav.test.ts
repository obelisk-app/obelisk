import { describe, expect, it } from 'vitest';
import { activeTabFor, badgeLabel, hintSurfaceFor, shouldHideMobileBottomNav } from '@/utils/shell/mobile/bottom-nav';
import { initialNav } from '@/utils/shell/mobile/url-state';

describe('hintSurfaceFor', () => {
  it('maps a screen with something to explain to its own surface', () => {
    expect(hintSurfaceFor('server')).toBe('server');
    expect(hintSurfaceFor('inbox')).toBe('inbox');
  });

  it('names the voice room surface `voice`', () => {
    expect(hintSurfaceFor('voice-room')).toBe('voice');
  });

  it('gives sheets, editors and sub-screens no surface', () => {
    expect(hintSurfaceFor('msg-actions')).toBeNull();
    expect(hintSurfaceFor('profile-edit')).toBeNull();
    expect(hintSurfaceFor('search')).toBeNull();
  });
});

describe('activeTabFor', () => {
  it('is the screen itself for a tab', () => {
    expect(activeTabFor({ ...initialNav, screen: 'feed' })).toBe('feed');
  });

  it('is the recorded parent for a sub-screen, else the static one', () => {
    expect(activeTabFor({ ...initialNav, screen: 'profile-view', parentScreen: 'inbox' })).toBe('inbox');
    expect(activeTabFor({ ...initialNav, screen: 'dm-thread' })).toBe('dms-list');
  });
});

describe('badgeLabel', () => {
  it('shows nothing for no count or zero', () => {
    expect(badgeLabel(undefined)).toBeNull();
    expect(badgeLabel(0)).toBeNull();
  });

  it('shows the count up to 99, then 99+', () => {
    expect(badgeLabel(7)).toBe('7');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
  });
});

describe('shouldHideMobileBottomNav', () => {
  it('hides on the full-viewport screens and while the keyboard is open', () => {
    expect(shouldHideMobileBottomNav('compose-dm', 0)).toBe(true);
    expect(shouldHideMobileBottomNav('profile-edit', 0)).toBe(true);
    expect(shouldHideMobileBottomNav('server', 1)).toBe(true);
    expect(shouldHideMobileBottomNav('channel', 0)).toBe(false);
  });
});
