import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InviteCreditsCard from './InviteCreditsCard';

const baseCredits = {
  eligible: true,
  available: 2,
  used: 1,
  limit: 3,
  messageCount: 25,
  daysActive: 10,
  minMessages: 20,
  minDaysActive: 7,
  reasons: [],
};

describe('InviteCreditsCard', () => {
  it('renders the unlimited badge for admin bypass', () => {
    render(
      <InviteCreditsCard
        serverId="s1"
        serverName="My Server"
        credits={{ ...baseCredits, adminBypass: true }}
      />
    );
    expect(screen.getByText(/Admin · unlimited/)).toBeInTheDocument();
    expect(screen.getByTestId('open-mint-form-btn')).toBeInTheDocument();
  });

  it('renders available credit count when eligible', () => {
    render(
      <InviteCreditsCard serverId="s1" serverName="My Server" credits={baseCredits} />
    );
    expect(screen.getByText(/2\/3 available/)).toBeInTheDocument();
    expect(screen.getByTestId('open-mint-form-btn')).toBeInTheDocument();
  });

  it('shows progress bars when ineligible', () => {
    const ineligible = {
      ...baseCredits,
      eligible: false,
      available: 0,
      messageCount: 5,
      daysActive: 2,
      reasons: ['15 more messages required', '5 more days of activity required'],
    };
    render(
      <InviteCreditsCard serverId="s1" serverName="My Server" credits={ineligible} />
    );
    expect(screen.getByText(/Not yet eligible/)).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // messages so far
    expect(screen.getByText(/20/)).toBeInTheDocument(); // min messages
    expect(screen.queryByTestId('open-mint-form-btn')).not.toBeInTheDocument();
  });

  it('shows spent message when eligible but no credits left', () => {
    render(
      <InviteCreditsCard
        serverId="s1"
        serverName="My Server"
        credits={{ ...baseCredits, available: 0 }}
      />
    );
    expect(screen.getByText(/used all your invites/)).toBeInTheDocument();
  });

  it('renders error fallback when credits are null', () => {
    render(<InviteCreditsCard serverId="s1" serverName="My Server" credits={null} />);
    expect(screen.getByText(/Could not load credits/)).toBeInTheDocument();
  });
});
