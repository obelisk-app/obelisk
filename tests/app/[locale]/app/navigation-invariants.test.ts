import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Desktop navigation is driven by `AppShell`'s own `view` state.
 * `bridge.setActiveGroup` only moves the relay subscription - calling it
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
 * Source with comments stripped - the rule is about what the code *does*,
 * and the comments here deliberately name `setActiveGroup` to explain why
 * it must not be called.
 */
const read = (p: string) =>
  readFileSync(join(process.cwd(), 'src/app/[locale]/app', p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Every file of the desktop shell: the entry and its parts under `desktop/`,
 * and the shell's hooks under `src/hooks/shell/desktop/`.
 */
const desktopShell = () =>
  [
    ...readdirSync(join(process.cwd(), 'src/app/[locale]/app/desktop')).map((f) => `desktop/${f}`),
    ...readdirSync(join(process.cwd(), 'src/hooks/shell/desktop')).map((f) => `../../../hooks/shell/desktop/${f}`),
  ]
    .map(read)
    .join('\n');

describe('desktop navigation invariants', () => {
  it('SearchBar never navigates via the bridge', () => {
    expect(read('search/SearchBar.tsx')).not.toContain('setActiveGroup');
  });

  it('SearchBar hands navigation to the shell instead', () => {
    // The bar's handlers live in its view model.
    expect(read('search/SearchBar.tsx')).toContain('useSearchBar(');
    expect(read('../../../hooks/shell/search/useSearchBar.ts')).toContain('requestJump');
  });

  it('the search panes and the shared search hook never navigate via the bridge either', () => {
    // The bar's panes moved to their own files and the search itself to a
    // hook; the rule follows the code.
    const searchHooks = readdirSync(join(process.cwd(), 'src/hooks/shell/search')).map((f) => `../../../hooks/shell/search/${f}`);
    const searchParts = readdirSync(join(process.cwd(), 'src/app/[locale]/app/search')).map((f) => `search/${f}`);
    for (const file of [...searchParts, ...searchHooks, '../../../hooks/chat/search/useRelaySearch.ts']) {
      expect(read(file), file).not.toContain('setActiveGroup');
    }
    // A channel result opens through the shell (`ChannelsSection` over `useChannelsSection`).
    expect(read('search/ChannelsSection.tsx')).toContain('useChannelsSection(');
    expect(read('../../../hooks/shell/search/useChannelsSection.ts')).toContain('requestJump');
    expect(read('../../../hooks/chat/search/useRelaySearch.ts')).toContain('requestJump');
  });

  it('the feed panel rounds its top-left corner, since it has no sidebar', () => {
    // Every other view gets the rounded corner from the sidebar pane's
    // `rounded-tl-xl`. The feed drops the sidebar, so `main` has to carry it
    // or the corner sits square against the rail.
    // The main column moved out of the shell into `shell/DesktopMain.tsx`.
    const main = read('desktop/DesktopMain.tsx');
    expect(main).toContain("view.kind === 'feed' ? 'rounded-tl-xl border-l' : ''");
  });

  it('the feed sits beside group chat, not as a tab inside it', () => {
    // Chat/Feed tabs made the two exclusive: you lost sight of a live room
    // to glance at the feed. The rail button cycles off → split → full.
    // The shell's tree is split across `shell/`; the rule covers all of it.
    const shell = desktopShell();
    expect(shell).not.toContain('chat-pane-tab-');
    expect(read('desktop/FeedSplitPane.tsx')).toContain('desktop-feed-pane');
    // The rail button is a plain toggle; size lives on the pane itself,
    // because three states behind one control meant you had to press it to
    // find out what it would do.
    expect(read('desktop/DesktopDrawer.tsx')).toContain('onPickFeed={onToggleFeed}');
    expect(shell).not.toContain('cycleFeed');
    const feedActions = read('panes/reader/FeedPaneActions.tsx');
    expect(feedActions).toContain('feed-pane-expand');
    expect(feedActions).toContain('feed-pane-close');
  });

  it('threads open in a side pane on desktop, not a modal', () => {
    // A modal hides the list you were reading, which is the context you need
    // while following a conversation.
    // The pane is `shell/ReaderPaneSlot.tsx`, its state `src/hooks/shell/desktop/useShellPanes.ts`.
    const slot = read('desktop/ReaderPaneSlot.tsx');
    expect(slot).toContain('desktop-thread-pane');
    expect(slot).toContain('THREAD_PANE_KEY');
    expect(read('desktop/DesktopShell.tsx')).toContain('<ReaderPaneSlot');
    // The feed hands thread AND article opening to the shell rather than
    // falling back to its own modal.
    const main = read('desktop/DesktopMain.tsx');
    expect(main).toContain('onOpenThread={');
    expect(main).toContain('onOpenArticle={');
    // One pane holds one thing: opening an article clears the thread stack.
    const panes = read('../../../hooks/shell/desktop/useShellPanes.ts');
    expect(panes).toContain('setThreadStack([]); setPaneArticle(note);');
    /*
     * Threads stack. Opening a note from inside a thread used to overwrite
     * the one being read, so back closed the pane instead of returning to
     * the conversation you came from.
     */
    expect(panes).toContain('const [threadStack, setThreadStack]');
    expect(slot).toContain('onOpenNote={pushThread}');
    // Depth, not a boolean - one history entry per level.
    expect(panes).toContain('useHistoryDismiss(paneDepth');
  });

  it('honours ?s=feed so a shared link can land on the feed', () => {
    // The public viewer's "Open in Obelisk" points at /app?s=feed. Mobile
    // already understands `?s=<screen>`; desktop had to learn it so one link
    // works whichever shell picks it up.
    // The deep-link effect lives in `src/hooks/shell/desktop/useDesktopNavigation.ts`.
    const nav = read('../../../hooks/shell/desktop/useDesktopNavigation.ts');
    expect(nav).toContain("params.get('s') === 'feed'");
    // A channel deep-link is more specific and must still win.
    expect(nav).toContain("if (!c && params.get('s') === 'feed')");
  });

  it('the shell answers a pendingJump by changing `view`, not the bridge', () => {
    const shell = read('../../../hooks/shell/desktop/useDesktopNavigation.ts');
    // The shell's view model holds the navigation; the shell reads the model.
    expect(read('desktop/DesktopShell.tsx')).toContain('useDesktopShell(');
    expect(read('../../../hooks/shell/desktop/useDesktopShell.ts')).toContain('useDesktopNavigation(');
    const effect = shell.slice(
      shell.indexOf('const pendingJump ='),
      shell.indexOf('consumeJump()'),
    );
    expect(effect).toBeTruthy();
    expect(effect).toContain('setView(');
    expect(effect).not.toContain('setActiveGroup');
  });
});
