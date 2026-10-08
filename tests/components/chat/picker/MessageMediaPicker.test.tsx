vi.mock('@/hooks/session/useSession', () => ({ useMyPubkey: () => 'a'.repeat(64) }));
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nostrActions } from '@/services/nostr-bridge';
import MessageMediaPicker from '@/components/chat/picker/MessageMediaPicker';
import { useChatStore } from '@/store/chat';
import { useToastStore } from '@/store/feedback/toast';
import { CodedError } from '@/utils/errors/codes';
import { LocaleProvider } from '@tests/support/intl';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


vi.mock('@/services/media/blossom', () => ({
  uploadToBlossom: vi.fn().mockResolvedValue('https://cdn.example/mine.webp'),
}));

vi.mock('@/services/nostr-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nostr-bridge')>();
  const { bridgeOverrides } = await import('@tests/support/mocks/nostr-bridge');
  return { ...actual, ...bridgeOverrides({ useMyPubkey: () => 'a'.repeat(64) }) };
});

afterEach(() => vi.restoreAllMocks());

const SERVER_MEDIA = {
  dance: 'https://cdn.example/dance.gif',
  wave: 'https://cdn.example/wave.webp',
  stamp: 'https://cdn.example/stamp.webp',
  applause_copy: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif',
};

/** The picker with server media of every kind, on `initialTab`. */
function renderWithServerMedia(initialTab?: 'emoji' | 'gif' | 'sticker') {
  const onPick = vi.fn();
  useChatStore.getState().setServerEmojis(
    SERVER_MEDIA,
    { dance: 'gif', wave: 'emoji', stamp: 'sticker', applause_copy: 'gif' },
  );
  renderLocalized(
    <MessageMediaPicker initialTab={initialTab} onPick={onPick} onClose={() => {}} customEmojis={SERVER_MEDIA} />,
  );
  return { onPick };
}

describe('MessageMediaPicker', () => {
  beforeEach(() => {
    localStorage.clear();
    useChatStore.getState().reset();
  });

  // One view per test: these used to be a single test that walked all three
  // tabs, about a second of jsdom accessibility queries on its own and far
  // more under a full parallel run. Split, each view carries its own share.
  it('emoji view: server emojis only, the emoji grid and its category bar', () => {
    renderWithServerMedia();

    expect(screen.queryByRole('button', { name: 'Packs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create emoji' })).toBeInTheDocument();
    // A well on the panel surface; green only while focused.
    expect(screen.getByRole('searchbox', { name: 'Search emoji' }).parentElement).toHaveClass('rounded-xl', 'bg-lc-black', 'border-lc-border', 'focus-within:border-lc-green');
    expect(screen.getByText('Server emojis')).toBeInTheDocument();
    expect(screen.queryByAltText(':dance:')).not.toBeInTheDocument();
    expect(screen.getByAltText(':wave:')).toBeInTheDocument();
    const categoryNav = screen.getByRole('navigation', { name: 'Emoji categories' });
    const emojiTab = screen.getByRole('button', { name: 'Emoji' });
    expect(categoryNav).toHaveClass('grid-cols-9');
    expect(categoryNav.compareDocumentPosition(emojiTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close emoji picker' })).not.toBeInTheDocument();
    expect(screen.getByTestId('media-picker-shell')).toHaveClass('h-[520px]', 'w-[600px]');
    expect(screen.getByTitle('grinning').parentElement).toHaveClass('grid-cols-12');
    expect(screen.getByText('Smileys & people')).toHaveClass('sticky', 'border-b');
    expect(screen.getByText('Smileys & people').parentElement?.parentElement).toHaveClass('overflow-y-auto');
  });

  it('GIF view: server and default GIFs, categories, recents, and the same shell size', () => {
    const { onPick } = renderWithServerMedia();
    const shellClass = screen.getByTestId('media-picker-shell').className;

    fireEvent.click(screen.getByRole('button', { name: 'GIF' }));
    expect(screen.getByRole('button', { name: 'Create GIF' })).toBeInTheDocument();
    expect(screen.getByTestId('media-picker-shell')).toHaveAttribute('class', shellClass);
    const mediaCategories = screen.getByRole('navigation', { name: 'Media categories' });
    expect(within(mediaCategories).getAllByRole('button')).toHaveLength(9);
    expect(mediaCategories.querySelectorAll('svg')).toHaveLength(9);
    expect(within(screen.getByRole('button', { name: 'Recent' })).getByTestId('recent-icon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close media picker' })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search GIFs' }).parentElement).toHaveClass('rounded-xl', 'bg-lc-black', 'focus-within:border-lc-green');
    expect(within(screen.getByTestId('media-section-server_gifs')).getByAltText(':dance:')).toBeInTheDocument();
    const defaultGifs = screen.getByTestId('media-section-default_gifs');
    expect(within(defaultGifs).getByAltText(':applause:')).toBeInTheDocument();
    expect(within(defaultGifs).getAllByRole('img')).toHaveLength(22);
    expect(screen.queryByAltText(':applause_copy:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText(':applause:'));
    expect(onPick).toHaveBeenCalledWith(expect.stringContaining('/giphy.gif'), undefined, 'gif');
    fireEvent.click(screen.getByRole('button', { name: 'Animals' }));
    expect(screen.getByAltText(':dancing_cat:')).toBeInTheDocument();
    expect(screen.queryByAltText(':applause:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    expect(screen.queryByAltText(':wave:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByAltText(':dance:'));
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    expect(screen.getByAltText(':dance:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    const gifTab = screen.getByRole('button', { name: 'GIF' });
    expect(screen.getByTestId('media-grid').compareDocumentPosition(gifTab) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sticker view: server and default stickers, recents, and the create tile', () => {
    renderWithServerMedia('sticker');

    expect(screen.getByRole('searchbox', { name: 'Search stickers' }).parentElement).toHaveClass('rounded-xl', 'bg-lc-black', 'focus-within:border-lc-green');
    expect(within(screen.getByTestId('media-section-server_stickers')).getByAltText(':stamp:')).toBeInTheDocument();
    const defaultSticker = within(screen.getByTestId('media-section-default_stickers')).getByAltText(':laugh_cry:');
    expect(defaultSticker).toBeInTheDocument();
    fireEvent.click(defaultSticker);
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    const recentSticker = within(screen.getByTestId('media-section-recent_stickers')).getByAltText(':laugh_cry:');
    expect(recentSticker).toBeInTheDocument();
    expect(recentSticker.closest('button')).not.toHaveAttribute('title');
    fireEvent.click(screen.getByRole('button', { name: 'Trending' }));
    expect(screen.getByTestId('media-section-my_stickers')).toBeInTheDocument();
    expect(within(screen.getByTestId('media-grid')).getAllByRole('button')[0]).toHaveAccessibleName('Create sticker');
  });

  it('never falls back to shortcode text when media fails to load', () => {
    useChatStore.getState().setServerEmojis({ stamp: 'https://cdn.example/gone.webp' }, { stamp: 'sticker' });
    renderLocalized(
      <MessageMediaPicker
        initialTab="sticker"
        onPick={() => {}}
        onClose={() => {}}
        customEmojis={{ stamp: 'https://cdn.example/gone.webp' }}
      />,
    );

    // Curated defaults are dropped outright; server media keeps its tile with a
    // glyph so the operator can see the asset is gone.
    fireEvent.error(screen.getByAltText(':laugh_cry:'));
    fireEvent.error(screen.getByAltText(':stamp:'));

    const defaults = screen.getByTestId('media-section-default_stickers');
    expect(within(defaults).queryByAltText(':laugh_cry:')).not.toBeInTheDocument();
    expect(defaults).not.toHaveTextContent(':laugh_cry:');
    const server = screen.getByTestId('media-section-server_stickers');
    expect(within(server).getByTestId('media-thumb-fallback')).toBeInTheDocument();
    expect(server).not.toHaveTextContent(':stamp:');
  });

  it('renders recent GIF and sticker picks in the emoji tab as media', () => {
    // The emoji tab only forwards emoji-kind entries to EmojiPicker, so a
    // recent GIF shortcode is unresolvable without the URL stored alongside it.
    localStorage.setItem('obelisk:recent-emojis', JSON.stringify([
      { char: ':dance:', url: 'https://cdn.example/dance.gif' },
      ':vanished:',
    ]));
    renderLocalized(
      <MessageMediaPicker
        onPick={() => {}}
        onClose={() => {}}
        customEmojis={{ wave: 'https://cdn.example/wave.webp', dance: 'https://cdn.example/dance.gif' }}
      />,
    );

    const recentSection = document.querySelector<HTMLElement>('[data-emoji-category="Recent"]')!;
    expect(within(recentSection).getByAltText(':dance:')).toHaveAttribute('src', 'https://cdn.example/dance.gif');
    expect(recentSection).not.toHaveTextContent(':dance:');
    expect(recentSection).not.toHaveTextContent(':vanished:');
  });

  it('returns a picked sticker with its portable NIP-30 metadata', () => {
    const onPick = vi.fn();
    renderLocalized(
      <MessageMediaPicker
        initialTab="sticker"
        onPick={onPick}
        onClose={() => {}}
        customEmojis={{ wave: 'https://cdn.example/wave.webp' }}
      />,
    );

    // The shell owns the surface; the dialog inside must not paint the page colour over it.
    expect(screen.getByRole('dialog', { name: 'Media picker' })).not.toHaveClass('bg-lc-black');
    expect(screen.getByTestId('media-picker-shell')).toHaveClass('border-lc-border', '[--picker-surface:var(--color-lc-dark)]');
    const waveButton = screen.getByRole('button', { name: ':wave:' });
    expect(waveButton).toHaveClass('min-w-0', 'overflow-hidden');
    expect(waveButton).not.toHaveAttribute('title');
    fireEvent.click(waveButton);
    expect(onPick).toHaveBeenCalledWith(
      ':wave:',
      { name: 'wave', url: 'https://cdn.example/wave.webp' },
      'sticker',
    );
  });

  it('uses server pack media types in the existing tabs', () => {
    useChatStore.getState().setServerEmojis(
      { clip: 'https://cdn.example/clip.webp', stamp: 'https://cdn.example/stamp.gif' },
      { clip: 'gif', stamp: 'sticker' },
    );
    renderLocalized(
      <MessageMediaPicker
        initialTab="gif"
        onPick={() => {}}
        onClose={() => {}}
        customEmojis={useChatStore.getState().serverEmojis}
      />,
    );

    expect(within(screen.getByTestId('media-section-server_gifs')).getByAltText(':clip:')).toBeInTheDocument();
    expect(screen.queryByAltText(':stamp:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stickers' }));
    expect(within(screen.getByTestId('media-section-server_stickers')).getByAltText(':stamp:')).toBeInTheDocument();
    expect(screen.queryByAltText(':clip:')).not.toBeInTheDocument();
  });

  it("favorites GIFs and opens pack creation in GIF mode", async () => {
    const saveFavorites = vi.spyOn(nostrActions, "saveMediaFavorites").mockResolvedValue(undefined);
    renderLocalized(<MessageMediaPicker initialTab="gif" onPick={() => {}} onClose={() => {}} customEmojis={{}} />);

    fireEvent.click(screen.getByRole("button", { name: "Add :applause: to favorites" }));
    await waitFor(() => expect(saveFavorites).toHaveBeenCalledWith({
      items: [{
        name: "applause",
        url: "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif",
        kind: "gif",
      }],
      packAddresses: [],
    }));

    fireEvent.click(screen.getByTestId("manage-media-packs"));
    expect(screen.getByTestId("media-library-modal")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "GIFs" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each([
    ["emoji", "emoji", "Create emoji"],
    ["gif", "gif", "Create GIF"],
    ["sticker", "sticker", "Create sticker"],
  ] as const)("creates an individual %s and opens favorites", async (initialTab, kind, buttonName) => {
    const saveFavorites = vi.spyOn(nostrActions, "saveMediaFavorites").mockResolvedValue(undefined);
    const savePack = vi.spyOn(nostrActions, "saveMediaPack").mockResolvedValue(undefined);
    renderLocalized(<MessageMediaPicker initialTab={initialTab} onPick={() => {}} onClose={() => {}} customEmojis={{}} />);

    expect(screen.getByRole("button", { name: buttonName })).toBeInTheDocument();
    const input = document.querySelector<HTMLInputElement>("input[type=\"file\"]");
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [new File(["image"], "Party Cat.webp", { type: "image/webp" })] } });

    await waitFor(() => expect(saveFavorites).toHaveBeenCalledWith({
      items: [{ name: "party_cat", url: "https://cdn.example/mine.webp", kind }],
      packAddresses: [],
    }));
    expect(savePack).not.toHaveBeenCalled();
    expect(screen.getByTestId("media-library-modal")).toBeInTheDocument();
    expect((await screen.findAllByRole("button", { name: "Favorites" })).some((button) => button.className.includes("text-lc-green"))).toBe(true);
  });

  it('says why creating media failed instead of failing silently', async () => {
    useToastStore.getState().clearToasts();
    vi.spyOn(nostrActions, 'saveMediaFavorites').mockRejectedValue(new CodedError('publish-rejected', 'Relay rejected event (kind 10030). blocked'));
    renderLocalized(<MessageMediaPicker initialTab="sticker" onPick={() => {}} onClose={() => {}} customEmojis={{}} />);

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input!, { target: { files: [new File(['image'], 'cat.webp', { type: 'image/webp' })] } });

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1));
    expect(useToastStore.getState().toasts[0]).toMatchObject({ title: "Couldn't upload media.", body: 'No relay accepted this.' });
    expect(screen.queryByTestId('media-library-modal')).not.toBeInTheDocument();
  });
});
