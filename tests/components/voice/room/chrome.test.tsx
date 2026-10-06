import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/nostr-bridge', () => ({
  useUserMetadata: (pk: string) => (pk === A ? { name: 'ada' } : null),
}));
vi.mock('@/components/marketing/ShootingStars', () => ({ default: () => null }));

import { CenteredPanel, PassiveCallRoster, Spinner } from '@/components/voice/room/chrome';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

afterEach(() => cleanup());

describe('PassiveCallRoster', () => {
  it('renders nothing when nobody is detected', () => {
    const { container } = renderLocalized(<PassiveCallRoster pubkeys={[]} count={0} />);
    expect(container.querySelector('[data-testid="passive-call-roster"]')).toBeNull();
  });

  it('names the detected participants, the topology, and how many more there are', () => {
    renderLocalized(<PassiveCallRoster pubkeys={[A, B]} count={5} mode="sfu" />);
    const roster = screen.getByTestId('passive-call-roster');
    expect(screen.getAllByTestId('passive-call-participant')).toHaveLength(2);
    expect(roster).toHaveTextContent('ada');
    expect(roster).toHaveTextContent(B.slice(0, 8));
    expect(roster).toHaveTextContent('SFU');
    expect(roster).toHaveTextContent('+3 more');
  });

  it('says the roster is still syncing when only a count is known', () => {
    renderLocalized(<PassiveCallRoster pubkeys={[]} count={2} mode="mesh" />);
    const roster = screen.getByTestId('passive-call-roster');
    expect(roster).toHaveTextContent('2 participants detected');
    expect(roster).toHaveTextContent('Mesh');
  });
});

describe('small panels', () => {
  it('centre their content and spin', () => {
    renderLocalized(<CenteredPanel><Spinner /><span>hello</span></CenteredPanel>);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading…')).toBeInTheDocument();
  });
});
