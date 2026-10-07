import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';
import MeshSyncStatusPill from '@/components/voice/room/MeshSyncStatusPill';
import RoomHeader from '@/components/voice/room/RoomHeader';
import type { SfuStatus } from '@/services/voice/room-events';

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

afterEach(() => cleanup());

describe('RoomHeader', () => {
  it('shows the name and the participant count', () => {
    renderLocalized(<RoomHeader name="Lounge" count={3} />);
    expect(screen.getByTestId('voice-room-header')).toHaveTextContent('Lounge');
    expect(screen.getByTestId('voice-room-header')).toHaveTextContent('3');
    expect(screen.queryByTestId('sfu-status')).toBeNull();
    expect(screen.queryByTestId('mesh-sync-status')).toBeNull();
  });

  it('shows the mesh-sync badge while peers are still connecting on a mesh call', () => {
    renderLocalized(<RoomHeader name="Lounge" count={3} meshSyncingCount={2} />);
    expect(screen.getByTestId('mesh-sync-status')).toHaveTextContent('2');
    expect(screen.queryByTestId('sfu-status')).toBeNull();
  });

  it('prefers the SFU pill over the mesh badge on a voice-sfu channel', () => {
    renderLocalized(<RoomHeader name="Big room" count={9} sfuStatus="starting" meshSyncingCount={4} />);
    expect(screen.getByTestId('sfu-status')).toHaveAttribute('data-sfu-status', 'starting');
    expect(screen.queryByTestId('mesh-sync-status')).toBeNull();
  });

  it.each<[SfuStatus, string]>([
    ['starting', 'SFU connecting'],
    ['connected', 'SFU connected'],
    ['unavailable', 'SFU unavailable'],
    ['unauthorized', 'SFU rejected'],
  ])('labels the %s status "%s"', (status, label) => {
    renderLocalized(<RoomHeader name="Big room" count={1} sfuStatus={status} />);
    expect(screen.getByTestId('sfu-status')).toHaveTextContent(label);
  });
});

describe('MeshSyncStatusPill', () => {
  it('renders nothing for zero and hides the count for one', () => {
    const { container } = renderLocalized(<MeshSyncStatusPill count={0} />);
    expect(container.querySelector('[data-testid="mesh-sync-status"]')).toBeNull();
    cleanup();
    renderLocalized(<MeshSyncStatusPill count={1} />);
    expect(screen.getByTestId('mesh-sync-status')).not.toHaveTextContent('1');
  });
});
