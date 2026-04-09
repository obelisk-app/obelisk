import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import ProtocolPrompt from './ProtocolPrompt';
import { useDMStore } from '@/store/dm';

describe('ProtocolPrompt', () => {
  beforeEach(() => {
    useDMStore.setState(useDMStore.getInitialState());
  });

  it('renders nothing when no prompt active', () => {
    const { container } = render(<ProtocolPrompt />);
    expect(container.innerHTML).toBe('');
  });

  it('renders popup when showProtocolPrompt is set', () => {
    useDMStore.setState({ showProtocolPrompt: 'somepubkey' });
    render(<ProtocolPrompt />);
    expect(screen.getByText('Choose DM Protocol')).toBeInTheDocument();
    expect(screen.getByText('NIP-17 (Recommended)')).toBeInTheDocument();
    expect(screen.getByText('NIP-04 (Legacy)')).toBeInTheDocument();
  });

  it('sets NIP-17 override when clicking NIP-17', async () => {
    useDMStore.setState({ showProtocolPrompt: 'pk1' });
    const user = userEvent.setup();
    render(<ProtocolPrompt />);

    await user.click(screen.getByText('NIP-17 (Recommended)'));
    const state = useDMStore.getState();
    expect(state.protocolOverrides['pk1']).toBe('nip17');
    expect(state.showProtocolPrompt).toBeNull();
  });

  it('sets NIP-04 override when clicking NIP-04', async () => {
    useDMStore.setState({ showProtocolPrompt: 'pk1' });
    const user = userEvent.setup();
    render(<ProtocolPrompt />);

    await user.click(screen.getByText('NIP-04 (Legacy)'));
    const state = useDMStore.getState();
    expect(state.protocolOverrides['pk1']).toBe('nip04');
    expect(state.showProtocolPrompt).toBeNull();
  });

  it('dismisses without choosing when clicking "Decide later"', async () => {
    useDMStore.setState({ showProtocolPrompt: 'pk1' });
    const user = userEvent.setup();
    render(<ProtocolPrompt />);

    await user.click(screen.getByText(/Decide later/));
    const state = useDMStore.getState();
    expect(state.showProtocolPrompt).toBeNull();
    expect(state.protocolOverrides['pk1']).toBeUndefined();
  });
});
