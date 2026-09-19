import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nip19 } from 'nostr-tools';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import GeneratedProfileEnhancements, { randomProfileName } from './GeneratedProfileEnhancements';

const uploadToBlossom = vi.fn()
  .mockResolvedValueOnce('https://cdn.example/avatar.jpg')
  .mockResolvedValueOnce('https://cdn.example/banner.jpg');
vi.mock('@/lib/blossom', () => ({ uploadToBlossom }));

const nsec = nip19.nsecEncode(new Uint8Array(32).fill(1));

describe('GeneratedProfileEnhancements', () => {
  it('renders media previews and puts the name suggestion inside the name field', async () => {
    expect(randomProfileName(() => 0)).toBe('Brave Badger');
    const onDraftChange = vi.fn();
    render(
      <div className="nui-modal-overlay">
        <GeneratedProfileEnhancements onDraftChange={onDraftChange} />
        <div className="obelisk-login-modal">
          <div className="nui-key-display">{nsec}</div>
          <label><input placeholder="Satoshi" /></label>
          <label><input placeholder="Builder, chef, occasional cyclist." /></label>
          <label><span>Picture URL</span><input type="url" placeholder="https://example.com/avatar.jpg" /></label>
        </div>
      </div>,
    );

    const randomButton = await screen.findByRole('button', { name: /suggest another name/i });
    const nameInput = document.querySelector<HTMLInputElement>('[data-obelisk-name]')!;

    // The suggestion must ride on the placeholder. Writing it into `value`
    // desyncs React's value tracker on the SDK's controlled input and makes the
    // field untypeable — the bug this component caused in production.
    expect(nameInput).toHaveValue('');
    expect(nameInput.placeholder).not.toBe('');
    expect(nameInput.placeholder).not.toBe('Satoshi');
    expect(onDraftChange).toHaveBeenCalledWith({ name: nameInput.placeholder });

    const firstSuggestion = nameInput.placeholder;
    fireEvent.click(randomButton);
    expect(nameInput).toHaveValue('');
    expect(onDraftChange).toHaveBeenLastCalledWith({ name: nameInput.placeholder });
    expect(firstSuggestion).not.toBe('');

    const urlInput = screen.getByPlaceholderText('https://example.com/avatar.jpg');
    expect(urlInput).not.toBeVisible();
    expect(screen.getByText('Upload banner')).toBeInTheDocument();

    const avatarPicker = document.querySelector<HTMLInputElement>('[data-kind="picture"] input[type="file"]');
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    fireEvent.change(avatarPicker!, { target: { files: [avatar] } });
    // The upload reaches publish through the draft, never through the SDK input.
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledWith({ picture: 'https://cdn.example/avatar.jpg' }));
    expect(urlInput).toHaveValue('');
    expect(document.querySelector('[data-kind="picture"] img')).toHaveAttribute('src', 'https://cdn.example/avatar.jpg');

    const bannerPicker = document.querySelector<HTMLInputElement>('[data-kind="banner"] input[type="file"]');
    const banner = new File(['banner'], 'banner.png', { type: 'image/png' });
    fireEvent.change(bannerPicker!, { target: { files: [banner] } });
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledWith({ banner: 'https://cdn.example/banner.jpg' }));
    expect(document.querySelector('[data-kind="banner"] img')).toHaveAttribute('src', 'https://cdn.example/banner.jpg');
  });

  /** Mirrors the real @nostr-wot/ui profile step: React-controlled inputs. */
  function SdkProfileStep() {
    const [name, setName] = useState('');
    const [about, setAbout] = useState('');
    return (
      <div className="obelisk-login-modal">
        <div className="nui-key-display">{nsec}</div>
        <div className="nui-profile-fields">
          <input className="nui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Satoshi" />
        </div>
        <div className="nui-profile-fields">
          <input
            className="nui-input"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Builder, chef, occasional cyclist."
          />
        </div>
      </div>
    );
  }

  it('leaves the SDK controlled inputs typeable and reports what the user types', async () => {
    const onDraftChange = vi.fn();
    render(
      <div className="nui-modal-overlay">
        <GeneratedProfileEnhancements onDraftChange={onDraftChange} />
        <SdkProfileStep />
      </div>,
    );

    await screen.findByRole('button', { name: /suggest another name/i });
    const nameInput = document.querySelector<HTMLInputElement>('[data-obelisk-name]')!;
    expect(nameInput).toHaveValue('');

    // Real keystrokes, not fireEvent.change: the production bug was React
    // reverting each keystroke, which only a per-character `input` reproduces.
    const user = userEvent.setup();
    await user.type(nameInput, 'Fabricio');
    expect(nameInput).toHaveValue('Fabricio');
    expect(onDraftChange).toHaveBeenLastCalledWith({ name: 'Fabricio' });

    // Typing their own name retires the suggestion control.
    const reroll = document.querySelector<HTMLButtonElement>('.obelisk-random-name')!;
    expect(reroll.hidden).toBe(true);

    // Clearing the field falls back to the suggestion rather than publishing a blank name.
    await user.clear(nameInput);
    expect(onDraftChange).toHaveBeenLastCalledWith({ name: nameInput.placeholder });
    expect(reroll.hidden).toBe(false);

    const aboutInput = screen.getByPlaceholderText('Builder, chef, occasional cyclist.');
    await user.type(aboutInput, 'hello world');
    expect(aboutInput).toHaveValue('hello world');
    expect(onDraftChange).toHaveBeenLastCalledWith({ about: 'hello world' });
  });
});
