import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPublishProfile = vi.fn().mockResolvedValue({ id: 'evt-1' });
const mockFetchCurrentKind0 = vi.fn().mockResolvedValue({});
const mockUploadToBlossom = vi.fn().mockResolvedValue('https://blossom.primal.net/abc123.jpg');

const mockSigner = { pubkey: 'abc123', signEvent: vi.fn(), getPublicKey: vi.fn().mockResolvedValue('abc123') };

vi.mock('@/lib/nostr', () => ({
  publishProfile: (...args: unknown[]) => mockPublishProfile(...args),
  fetchCurrentKind0: (...args: unknown[]) => mockFetchCurrentKind0(...args),
}));

vi.mock('@nostr-wot/data/react', () => ({
  useSigner: () => mockSigner,
}));

vi.mock('@/lib/blossom', () => ({
  uploadToBlossom: (...args: unknown[]) => mockUploadToBlossom(...args),
}));

const mockSyncProfile = vi.fn().mockResolvedValue(undefined);

const mockAuthState = {
  profile: { pubkey: 'abc123', npub: 'npub1abc', name: 'Test', displayName: 'Test', picture: null },
  syncProfile: mockSyncProfile,
};

vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn((selector?: (s: typeof mockAuthState) => unknown) =>
    typeof selector === 'function' ? selector(mockAuthState) : mockAuthState
  ),
}));

vi.mock('@/i18n/context', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ProfileEditor from './ProfileEditor';

describe('ProfileEditor', () => {
  const mockOnComplete = vi.fn();
  const mockOnSkip = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCurrentKind0.mockResolvedValue({});
  });

  describe('setup mode', () => {
    it('renders setup title', () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);
      expect(screen.getByText('profileEditor.setupTitle')).toBeInTheDocument();
    });

    it('does not render a skip button (name is mandatory)', () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);
      expect(screen.queryByText('profileEditor.skip')).not.toBeInTheDocument();
    });

    it('generates a random name when dice button is clicked', async () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);
      const input = screen.getByPlaceholderText('profileEditor.namePlaceholder') as HTMLInputElement;
      expect(input.value).toBe('');
      await userEvent.click(screen.getByLabelText('profileEditor.randomName'));
      expect(input.value).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d+$/);
    });

    it('disables publish when name is empty (mandatory)', () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);
      const publishBtn = screen.getByText('profileEditor.publish');
      expect(publishBtn).toBeDisabled();
    });

    it('publishes profile with name and calls onComplete', async () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);

      await userEvent.type(screen.getByPlaceholderText('profileEditor.namePlaceholder'), 'Alice');
      await userEvent.click(screen.getByText('profileEditor.publish'));

      await waitFor(() => {
        expect(mockPublishProfile).toHaveBeenCalledWith(mockSigner, {
          name: 'Alice',
          display_name: 'Alice',
        });
      });

      await waitFor(() => {
        expect(mockSyncProfile).toHaveBeenCalled();
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('uploads picture to blossom when file is selected', async () => {
      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);

      // Type name first (mandatory)
      await userEvent.type(screen.getByPlaceholderText('profileEditor.namePlaceholder'), 'Alice');

      // Simulate file selection
      const file = new File(['pixels'], 'avatar.png', { type: 'image/png' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await userEvent.click(screen.getByText('profileEditor.publish'));

      await waitFor(() => {
        expect(mockUploadToBlossom).toHaveBeenCalledWith(file, mockSigner);
      });

      await waitFor(() => {
        expect(mockPublishProfile).toHaveBeenCalledWith(mockSigner, {
          name: 'Alice',
          display_name: 'Alice',
          picture: 'https://blossom.primal.net/abc123.jpg',
        });
      });
    });
  });

  describe('edit mode', () => {
    it('pre-fills from kind 0 data', async () => {
      mockFetchCurrentKind0.mockResolvedValue({
        name: 'OldName',
        display_name: 'OldName',
        picture: 'https://example.com/old.jpg',
        about: 'Old bio',
        nip05: 'user@example.com',
        lud16: 'user@walletofsatoshi.com',
      });

      render(<ProfileEditor mode="edit" onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('OldName')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Old bio')).toBeInTheDocument();
      });
    });

    it('renders edit title and cancel button', async () => {
      render(<ProfileEditor mode="edit" onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('profileEditor.editTitle')).toBeInTheDocument();
        expect(screen.getByText('profileEditor.cancel')).toBeInTheDocument();
      });
    });

    it('shows confirmation before publishing in edit mode', async () => {
      mockFetchCurrentKind0.mockResolvedValue({
        name: 'OldName',
        display_name: 'OldName',
        about: '',
        nip05: 'keep@me.com',
      });

      render(<ProfileEditor mode="edit" onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByDisplayValue('OldName')).toBeInTheDocument();
      });

      const nameInput = screen.getByDisplayValue('OldName');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'NewName');

      await userEvent.click(screen.getByText('profileEditor.publish'));

      expect(screen.getByText('profileEditor.confirmDesc')).toBeInTheDocument();
    });

    it('calls onComplete when cancel is clicked', async () => {
      render(<ProfileEditor mode="edit" onComplete={mockOnComplete} />);

      await waitFor(() => {
        expect(screen.getByText('profileEditor.cancel')).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText('profileEditor.cancel'));
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('shows error when publish fails', async () => {
      mockPublishProfile.mockRejectedValueOnce(new Error('Network error'));

      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);

      await userEvent.type(screen.getByPlaceholderText('profileEditor.namePlaceholder'), 'Alice');
      await userEvent.click(screen.getByText('profileEditor.publish'));

      await waitFor(() => {
        expect(screen.getByText('profileEditor.publishError')).toBeInTheDocument();
      });
      expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('shows error when blossom upload fails', async () => {
      mockUploadToBlossom.mockRejectedValueOnce(new Error('Server error'));

      render(<ProfileEditor mode="setup" onComplete={mockOnComplete} onSkip={mockOnSkip} />);

      await userEvent.type(screen.getByPlaceholderText('profileEditor.namePlaceholder'), 'Alice');

      const file = new File(['pixels'], 'avatar.png', { type: 'image/png' });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(fileInput, file);

      await userEvent.click(screen.getByText('profileEditor.publish'));

      await waitFor(() => {
        expect(screen.getByText('profileEditor.publishError')).toBeInTheDocument();
      });
    });
  });
});
