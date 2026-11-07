vi.mock('@/hooks/session/useSession', async () => {
  const { sessionMock } = await import('@tests/support/mocks/session');
  return sessionMock({
    useMyPubkey: () => author,
  });
});
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MediaLibraryModal from '@/components/media/library/MediaLibraryModal';
import { LocaleProvider } from '@tests/support/intl';
import { ConfirmDialogHost } from '@/components/ui/overlays/ConfirmDialog';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


const author = 'a'.repeat(64);
const pack = {
  address: `30030:${author}:cats`,
  identifier: 'cats',
  author,
  title: 'Cat pack',
  description: 'Cats for every chat',
  image: '',
  items: Array.from({ length: 6 }, (_, index) => ({
    name: index === 0 ? 'party_cat' : 'cat_' + (index + 1),
    url: 'https://cdn.example/cat-' + (index + 1) + '.webp',
    kind: 'sticker' as const,
  })),
  createdAt: 10,
};

const mocks = vi.hoisted(() => ({
  saveMediaPack: vi.fn().mockResolvedValue(undefined),
  saveMediaFavorites: vi.fn().mockResolvedValue(undefined),
  deleteMediaPack: vi.fn().mockResolvedValue(undefined),
  publishRelayEmojiSet: vi.fn().mockResolvedValue(undefined),
  favoriteItems: [] as Array<{ name: string; url: string; kind: "emoji" | "gif" | "sticker"; packAddress?: string }>,
}));

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    nostrActions: {
      saveMediaPack: (...args: unknown[]) => mocks.saveMediaPack(...args),
      saveMediaFavorites: (...args: unknown[]) => mocks.saveMediaFavorites(...args),
      deleteMediaPack: (...args: unknown[]) => mocks.deleteMediaPack(...args),
    },
    useMediaPacks: () => ({
      [pack.address]: pack,
    }),
    useMyMediaFavorites: () => ({ items: mocks.favoriteItems, packAddresses: [], createdAt: 0 }),

  });
});

vi.mock('@/services/relay/relay-emojis', () => ({
  publishRelayEmojiSet: (...args: unknown[]) => mocks.publishRelayEmojiSet(...args),
}));

vi.mock('@/hooks/relay/operator/useRelayOperatorPubkey', () => ({ useRelayOperatorPubkey: () => author }));
vi.mock('@/services/media/save-library-pack', () => ({ saveLibraryPack: (draft: unknown) => mocks.saveMediaPack(draft) }));

vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: vi.fn().mockResolvedValue('https://cdn.example/uploaded.gif') }));

describe('MediaLibraryModal', () => {
  beforeEach(() => {
    mocks.saveMediaPack.mockClear();
    mocks.saveMediaFavorites.mockClear();
    mocks.deleteMediaPack.mockClear();
    mocks.publishRelayEmojiSet.mockClear();
    mocks.favoriteItems = [];
  });

  it('opens directly on a sticker detail and explores its source pack', () => {
    const onClose = vi.fn();
    renderLocalized(<MediaLibraryModal onClose={onClose} initialSelection={{ pack, item: pack.items[0] }} />);

    expect(screen.getByTestId('media-item-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('media-library-modal')).toBeNull();
    expect(screen.queryByText('Marketplace')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add item to favorites' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Cat pack' }));
    expect(within(screen.getByTestId('media-pack-viewer')).getByAltText(':cat_6:')).toBeInTheDocument();
    expect(screen.queryByTestId('media-library-modal')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close pack viewer' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('explores a complete pack in place and favorites either the pack or one item', async () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} />);

    const modal = screen.getByTestId('media-library-modal');
    expect(modal.firstElementChild).toHaveClass('h-[calc(100dvh_-_1rem)]', 'max-h-[calc(100%_-_1rem)]');
    expect(modal.querySelector('main')).toHaveClass('min-h-0');
    expect(within(modal).getByRole('heading', { level: 2, name: 'Media library' })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: 'Close media library' })).toBeInTheDocument();
    expect(screen.getByText('Cat pack')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Cat pack' }));
    expect(mocks.saveMediaFavorites).toHaveBeenCalledWith({
      items: [],
      packAddresses: [pack.address],
    });

    expect(screen.queryByAltText(':cat_6:')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View pack' }));
    const viewer = screen.getByTestId('media-pack-viewer');
    expect(within(viewer).getByAltText(':cat_6:')).toBeInTheDocument();
    fireEvent.click(within(viewer).getByRole('button', { name: 'Open :party_cat: actions' }));
    const menu = screen.getByTestId('media-item-menu');
    expect(within(menu).getByRole('button', { name: 'View Cat pack' })).toBeInTheDocument();
    await waitFor(() => expect(within(menu).getByRole('button', { name: 'Add item to favorites' })).not.toBeDisabled());
    fireEvent.click(within(menu).getByRole('button', { name: 'Add item to favorites' }));
    expect(mocks.saveMediaFavorites).toHaveBeenLastCalledWith({
      items: [pack.items[0]],
      packAddresses: [],
    });
  });

  it('speaks Spanish: tabs, filters, counts and the save chip', () => {
    render(<LocaleProvider initialLocale="es"><MediaLibraryModal embedded onClose={() => {}} /></LocaleProvider>);
    expect(screen.getAllByRole('button', { name: 'Mercado' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Mis packs' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument();
    expect(screen.getByText('6 ítems')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar Cat pack' })).toHaveTextContent('Guardar pack');
  });

  it('renders inside an existing settings workspace without another modal', () => {
    renderLocalized(<MediaLibraryModal embedded onClose={() => {}} />);

    expect(screen.getByTestId('media-library-embedded')).toBeInTheDocument();
    expect(screen.queryByTestId('media-library-modal')).toBeNull();
  });

  it('deletes an owned pack after confirmation', async () => {
    renderLocalized(<><MediaLibraryModal onClose={() => {}} initialTab="mine" /><ConfirmDialogHost /></>);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mocks.deleteMediaPack).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByTestId('confirm-dialog-confirm'));

    await waitFor(() => expect(mocks.deleteMediaPack).toHaveBeenCalledWith(pack.address));
  });

  it('keeps the pack when the confirmation is cancelled', async () => {
    renderLocalized(<><MediaLibraryModal onClose={() => {}} initialTab="mine" /><ConfirmDialogHost /></>);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull());
    expect(mocks.deleteMediaPack).not.toHaveBeenCalled();
  });

  it('creates and edits an independent named pack', async () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialTab="mine" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Create pack' })[0]);
    const editor = screen.getByTestId('media-pack-editor');
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Pack name' }), { target: { value: 'My reactions' } });
    fireEvent.change(within(editor).getByRole('combobox', { name: 'New item type' }), { target: { value: 'emoji' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Add URL' }));
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Item 1 shortcode' }), { target: { value: 'wow' } });
    fireEvent.change(within(editor).getByRole('textbox', { name: 'Item 1 URL' }), { target: { value: 'https://cdn.example/wow.webp' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Save pack' }));

    await waitFor(() => expect(mocks.saveMediaPack).toHaveBeenCalledWith(expect.objectContaining({
      title: 'My reactions',
      items: [{ name: 'wow', url: 'https://cdn.example/wow.webp', kind: 'emoji' }],
    })));
  });

  it("uploads individual media and switches to favorites", async () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialTab="mine" initialKind="gif" />);

    expect(screen.getAllByRole("button", { name: "Upload media" })).toHaveLength(2);
    const input = document.querySelector<HTMLInputElement>("input[type=\"file\"]");
    fireEvent.change(input!, { target: { files: [new File(["gif"], "Victory Dance.gif", { type: "image/gif" })] } });

    await waitFor(() => expect(mocks.saveMediaFavorites).toHaveBeenCalledWith({
      items: [{ name: "victory_dance", url: "https://cdn.example/uploaded.gif", kind: "gif" }],
      packAddresses: [],
    }));
    expect(screen.getByText("Uploaded :victory_dance: to individual favorites.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Favorites" }).some((button) => button.className.includes("text-lc-green"))).toBe(true);
  });

  it("opens an individual favorite from its thumbnail and only removes it from the star", async () => {
    mocks.favoriteItems = [pack.items[0]];
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialTab="favorites" />);

    fireEvent.click(screen.getByRole("button", { name: "Open :party_cat: actions" }));
    expect(screen.getByTestId("media-item-menu")).toBeInTheDocument();
    expect(mocks.saveMediaFavorites).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Create pack with this item" }));
    const editor = screen.getByTestId("media-pack-editor");
    expect(within(editor).getByRole("textbox", { name: "Pack name" })).toHaveValue("party_cat pack");
    expect(within(editor).getByRole("textbox", { name: "Item 1 shortcode" })).toHaveValue("party_cat");
    fireEvent.click(within(editor).getByRole("button", { name: "Close pack editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove :party_cat: from favorites" }));
    await waitFor(() => expect(mocks.saveMediaFavorites).toHaveBeenCalledWith({ items: [], packAddresses: [] }));
  });

  it('previews a server snapshot while preserving individual items and leaving sources untouched', async () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} server={{ relayUrl: 'wss://relay.example',
      emojiSet: { title: 'Server', emojis: [{ name: 'legacy', url: 'https://cdn.example/legacy.png', kind: 'emoji' }], packAddresses: [], updatedAt: 1 },
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy pack to server' }));
    const editor = screen.getByTestId('media-pack-editor');
    expect(within(editor).getByDisplayValue('legacy')).toBeInTheDocument();
    expect(within(editor).getByDisplayValue('party_cat')).toBeInTheDocument();
    expect(mocks.publishRelayEmojiSet).not.toHaveBeenCalled();
    fireEvent.click(within(editor).getByRole('button', { name: 'Save pack' }));
    await waitFor(() => expect(mocks.saveMediaPack).toHaveBeenCalledWith(expect.objectContaining({
      serverRelay: 'wss://relay.example', items: expect.arrayContaining([expect.objectContaining({ name: 'legacy' }), pack.items[0]]),
    })));
    expect(pack.items).toHaveLength(6);
  });

  it('requires explicit save before converting live server references', () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} server={{ relayUrl: 'wss://relay.example',
      emojiSet: { title: 'Server', emojis: [], packAddresses: [pack.address], updatedAt: 1 },
    }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit server media' }));
    expect(screen.getByTestId('media-pack-editor')).toBeInTheDocument();
    expect(mocks.publishRelayEmojiSet).not.toHaveBeenCalled();
    expect(mocks.saveMediaPack).not.toHaveBeenCalled();
  });

  it('copies an existing item into an existing owned pack through a reviewable merge', async () => {
    const item = { name: 'party_cat', url: 'https://cdn.example/different.png', kind: 'emoji' as const };
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialSelection={{ item }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to pack' }));
    const transfer = screen.getByTestId('media-transfer');
    fireEvent.change(within(transfer).getByRole('combobox', { name: 'Destination' }), { target: { value: pack.address } });
    fireEvent.click(within(transfer).getByRole('button', { name: 'Preview merge' }));
    const editor = screen.getByTestId('media-pack-editor');
    expect(within(editor).getByDisplayValue('party_cat_2')).toBeInTheDocument();
    expect(mocks.saveMediaPack).not.toHaveBeenCalled();
    fireEvent.click(within(editor).getByRole('button', { name: 'Save pack' }));
    await waitFor(() => expect(mocks.saveMediaPack).toHaveBeenCalledWith(expect.objectContaining({
      identifier: pack.identifier, baseCreatedAt: 10,
      items: expect.arrayContaining([{ ...item, name: 'party_cat_2' }]),
    })));
  });

  it('launched from an item: favouriting it saves and closes the whole library', async () => {
    const onClose = vi.fn();
    renderLocalized(<MediaLibraryModal onClose={onClose} initialSelection={{ pack, item: pack.items[0] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add item to favorites' }));
    expect(mocks.saveMediaFavorites).toHaveBeenCalledWith({ items: [pack.items[0]], packAddresses: [] });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('launched from an item: starting a pack with it opens the editor named after it', () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialSelection={{ pack, item: pack.items[0] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create pack with this item' }));
    const editor = screen.getByTestId('media-pack-editor');
    expect(within(editor).getByRole('textbox', { name: 'Pack name' })).toHaveValue('party_cat pack');
    expect(screen.queryByTestId('media-item-menu')).toBeNull();
  });

  it('in the library, favouriting from the item menu closes only the menu', async () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Open :party_cat: actions' })[0]);
    const menu = screen.getByTestId('media-item-menu');
    fireEvent.click(within(menu).getByRole('button', { name: 'View Cat pack' }));
    expect(screen.queryByTestId('media-item-menu')).toBeNull();
    expect(screen.getByTestId('media-pack-viewer')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('media-pack-viewer')).getByRole('button', { name: 'Open :cat_2: actions' }));
    await waitFor(() => expect(within(screen.getByTestId('media-item-menu')).getByRole('button', { name: 'Add item to favorites' })).not.toBeDisabled());
    fireEvent.click(within(screen.getByTestId('media-item-menu')).getByRole('button', { name: 'Add item to favorites' }));
    expect(screen.queryByTestId('media-item-menu')).toBeNull();
    expect(screen.getByTestId('media-library-modal')).toBeInTheDocument();
  });

  it('a favourite saved without its pack address still finds its pack; the kind chips filter favourites', () => {
    mocks.favoriteItems = [pack.items[0], { name: 'dance', url: 'https://cdn.example/dance.gif', kind: 'gif' }];
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialTab="favorites" />);
    expect(screen.getByText('Favorite a pack or individual item to keep it across servers.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open :dance: actions' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'GIFs' }));
    expect(screen.queryByRole('button', { name: 'Open :party_cat: actions' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open :party_cat: actions' }));
    expect(within(screen.getByTestId('media-item-menu')).getByRole('button', { name: 'View Cat pack' })).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('media-item-menu')).getByRole('button', { name: 'Close media actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open :dance: actions' }));
    expect(within(screen.getByTestId('media-item-menu')).queryByRole('button', { name: /^View / })).toBeNull();
  });

  it('shows the empty copy for a search that finds nothing', () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search packs and media' }), { target: { value: 'zzzz' } });
    expect(screen.getByText('No packs found.')).toBeInTheDocument();
  });

  it('launched from an item: a pack started from another item of its pack opens the editor', () => {
    renderLocalized(<MediaLibraryModal onClose={() => {}} initialSelection={{ pack, item: pack.items[0] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Cat pack' }));
    fireEvent.click(within(screen.getByTestId('media-pack-viewer')).getByRole('button', { name: 'Open :cat_2: actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create pack with this item' }));
    const editor = screen.getByTestId('media-pack-editor');
    expect(within(editor).getByRole('textbox', { name: 'Pack name' })).toHaveValue('cat_2 pack');
  });
});
