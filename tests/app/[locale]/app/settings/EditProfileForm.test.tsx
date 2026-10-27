import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const editUserMetadata = vi.hoisted(() => vi.fn());

vi.mock('@/services/media/blossom', () => ({ uploadToBlossom: vi.fn(), BlossomUploadError: class extends Error {} }));

import { EditProfileForm } from '@/app/[locale]/app/settings/EditProfileForm';
import { avatarInitials } from '@/utils/identity/display-name';

const PK = '89' + 'f'.repeat(62);

const INITIAL = { displayName: 'Ana', name: 'ana', about: 'hi', picture: null, banner: null, nip05: 'ana@x.io', lud16: null, website: 'https://ana.io' };

function mount(onCancel = vi.fn(), onSaved = vi.fn(), initial: typeof INITIAL | null = INITIAL, locale: 'en' | 'es' | 'pt' = 'en') {
  renderWithBridge(<EditProfileForm pubkey={PK} initial={initial} onCancel={onCancel} onSaved={onSaved} />, fakeBridge({}, { editUserMetadata }), { locale });
  return { onCancel, onSaved };
}

describe('EditProfileForm', () => {
  it('prefills every field from the initial profile and focuses the name', () => {
    mount();
    expect(screen.getByLabelText('Name')).toHaveValue('Ana');
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(screen.getByLabelText('About')).toHaveValue('hi');
    expect(screen.getByLabelText('NIP-05')).toHaveValue('ana@x.io');
    expect(screen.getByLabelText('Lightning address')).toHaveValue('');
    expect(screen.getByLabelText('Website')).toHaveValue('https://ana.io');
  });

  it('edits flow back into the fields', () => {
    mount();
    fireEvent.change(screen.getByLabelText('Website'), { target: { value: 'https://b.io' } });
    expect(screen.getByLabelText('Website')).toHaveValue('https://b.io');
  });

  it('saves the trimmed profile, then reports it saved', async () => {
    editUserMetadata.mockResolvedValueOnce(undefined);
    const { onSaved } = mount();
    fireEvent.change(screen.getByLabelText('About'), { target: { value: '  new about ' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-profile-button')); });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(editUserMetadata).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ana', displayName: 'Ana', about: 'new about' }), expect.objectContaining({ assertCurrent: expect.any(Function) }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('refuses to save without a name', async () => {
    editUserMetadata.mockClear();
    mount();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  ' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-profile-button')); });
    expect(editUserMetadata).not.toHaveBeenCalled();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
  });

  it('cancels', () => {
    const { onCancel } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('keeps Save and Cancel in a row stuck to the foot of the scroll area', () => {
    mount();
    const row = screen.getByTestId('profile-form-actions');
    expect(row.className).toContain('sticky');
    expect(row.className).toContain('bottom-0');
    expect(row).toContainElement(screen.getByTestId('save-profile-button'));
    expect(row).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('localizes the example addresses', () => {
    mount(vi.fn(), vi.fn(), INITIAL, 'es');
    expect(screen.getByLabelText('NIP-05')).toHaveAttribute('placeholder', 'vos@ejemplo.com');
    expect(screen.getByLabelText('Dirección Lightning')).toHaveAttribute('placeholder', 'vos@walletofsatoshi.com');
  });

  it('a nameless account gets the shared avatar fallback from its own key, not "0"', () => {
    mount(vi.fn(), vi.fn(), null);
    const editor = screen.getByTestId('profile-appearance-editor');
    const letter = avatarInitials(null, PK).slice(0, 1);
    expect(letter).not.toBe('8');
    expect(editor.querySelector('.rounded-full.bg-lc-olive')?.textContent).toBe(letter);
  });
});
