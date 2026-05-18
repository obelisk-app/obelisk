import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RelayEmojiAdminModal from './RelayEmojiAdminModal';

const mocks = vi.hoisted(() => ({
  uploadToBlossom: vi.fn(async (file: File) => `https://cdn.example/${file.name}`),
  publishRelayEmojiSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/blossom', () => ({
  uploadToBlossom: (...args: [File]) => mocks.uploadToBlossom(...args),
}));

vi.mock('@/lib/relay-emojis', () => ({
  publishRelayEmojiSet: (...args: unknown[]) => mocks.publishRelayEmojiSet(...args),
}));

describe('RelayEmojiAdminModal', () => {
  it('uploads a folder of images and appends normalized shortcode rows', async () => {
    render(
      <RelayEmojiAdminModal
        relayUrl="wss://relay.example"
        configuredRelays={['wss://relay.example']}
        emojiSet={{ title: '', emojis: [], updatedAt: 0 }}
        onClose={() => {}}
      />,
    );

    const input = screen.getByTestId('relay-emoji-folder-input');
    fireEvent.change(input, {
      target: {
        files: [
          new File(['party'], 'Party Parrot.webp', { type: 'image/webp' }),
          new File(['wave'], 'wave.png', { type: 'image/png' }),
          new File(['skip'], 'notes.txt', { type: 'text/plain' }),
        ],
      },
    });

    await waitFor(() => {
      expect(mocks.uploadToBlossom).toHaveBeenCalledTimes(2);
      expect(screen.getByText(':party_parrot:')).toBeTruthy();
      expect(screen.getByText(':wave:')).toBeTruthy();
    });
  });
});
