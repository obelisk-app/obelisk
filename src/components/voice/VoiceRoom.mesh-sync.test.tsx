import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeshSyncStatusPill } from './VoiceRoom';
import { LocaleProvider } from '@/i18n/context';

/** The component reads its copy from the dictionary, so it needs a provider. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


describe('MeshSyncStatusPill', () => {
  it('renders nothing when all mesh peer connections are established', () => {
    renderLocalized(<MeshSyncStatusPill count={0} />);
    expect(screen.queryByTestId('mesh-sync-status')).toBeNull();
  });

  it('renders a mobile-visible syncing badge while mesh media connects', () => {
    renderLocalized(<MeshSyncStatusPill count={2} />);
    const badge = screen.getByTestId('mesh-sync-status');
    expect(badge).toHaveTextContent(/media syncing|syncing/i);
    expect(badge).toHaveTextContent('2');
    expect(badge).toHaveAttribute(
      'title',
      '2 peers detected; WebRTC media channels are still syncing in the background.',
    );
  });
});
