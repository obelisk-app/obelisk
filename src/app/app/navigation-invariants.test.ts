import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Desktop navigation is driven by `AppShell`'s own `view` state.
 * `bridge.setActiveGroup` only moves the relay subscription — calling it
 * from a component mounted *below* the shell changes which data is loading
 * behind a panel the user is never sent to, so the click looks like it did
 * nothing.
 *
 * Both search-result paths hit this: clicking a channel result called
 * `setActiveGroup` directly, and the message-jump effect did too. The unit
 * test at the time asserted the bridge mock had been called, so it passed
 * while the feature was dead. These guard the rule at the source level,
 * which is the layer the mistake actually lives at.
 */
/**
 * Source with comments stripped — the rule is about what the code *does*,
 * and the comments here deliberately name `setActiveGroup` to explain why
 * it must not be called.
 */
const read = (p: string) =>
  readFileSync(join(__dirname, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('desktop navigation invariants', () => {
  it('SearchBar never navigates via the bridge', () => {
    expect(read('SearchBar.tsx')).not.toContain('setActiveGroup');
  });

  it('SearchBar hands navigation to the shell instead', () => {
    expect(read('SearchBar.tsx')).toContain('requestJump');
  });

  it('the feed panel rounds its top-left corner, since it has no sidebar', () => {
    // Every other view gets the rounded corner from the sidebar pane's
    // `rounded-tl-xl`. The feed drops the sidebar, so `main` has to carry it
    // or the corner sits square against the rail.
    const shell = read('DesktopShell.tsx');
    expect(shell).toContain("view.kind === 'feed' ? 'rounded-tl-xl border-l' : ''");
  });

  it('the feed sits beside group chat, not as a tab inside it', () => {
    // Chat/Feed tabs made the two exclusive: you lost sight of a live room
    // to glance at the feed. The rail button cycles off → split → full.
    const shell = read('DesktopShell.tsx');
    expect(shell).not.toContain('chat-pane-tab-');
    expect(shell).toContain('desktop-feed-pane');
    expect(shell).toContain('const cycleFeed');
    expect(shell).toContain('onPickFeed={cycleFeed}');
  });

  it('threads open in a side pane on desktop, not a modal', () => {
    // A modal hides the list you were reading, which is the context you need
    // while following a conversation.
    const shell = read('DesktopShell.tsx');
    expect(shell).toContain('desktop-thread-pane');
    expect(shell).toContain('THREAD_PANE_KEY');
    // The feed hands thread AND article opening to the shell rather than
    // falling back to its own modal.
    expect(shell).toContain('onOpenThread={');
    expect(shell).toContain('onOpenArticle={');
    // One pane holds one thing: opening an article clears the thread.
    expect(shell).toContain('setThreadNoteId(null); setPaneArticle(note);');
  });

  it('honours ?s=feed so a shared link can land on the feed', () => {
    // The public viewer's "Open in Obelisk" points at /app?s=feed. Mobile
    // already understands `?s=<screen>`; desktop had to learn it so one link
    // works whichever shell picks it up.
    const shell = read('DesktopShell.tsx');
    expect(shell).toContain("params.get('s') === 'feed'");
    // A channel deep-link is more specific and must still win.
    expect(shell).toContain("if (!c && params.get('s') === 'feed')");
  });

  it('the shell answers a pendingJump by changing `view`, not the bridge', () => {
    const shell = read('DesktopShell.tsx');
    const effect = shell.slice(
      shell.indexOf('const pendingJump ='),
      shell.indexOf('consumeJump()'),
    );
    expect(effect).toBeTruthy();
    expect(effect).toContain('setView(');
    expect(effect).not.toContain('setActiveGroup');
  });
});
