import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ModActionCard from './ModActionCard';
import { shortNpub } from '@/lib/mentions';

describe('ModActionCard', () => {
  const baseAction = {
    id: '1',
    actorPubkey: 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666',
    targetPubkey: '1111aaaa2222bbbb3333cccc4444dddd5555eeee6666ffff',
    action: 'ban',
    reason: 'Spam',
    metadata: null,
    createdAt: new Date().toISOString(),
  };

  it('renders action label', () => {
    render(<ModActionCard action={baseAction} />);
    expect(screen.getByText('Banned')).toBeInTheDocument();
  });

  it('renders reason', () => {
    render(<ModActionCard action={baseAction} />);
    expect(screen.getByText('Reason: Spam')).toBeInTheDocument();
  });

  it('renders target pubkey as a short npub label', () => {
    render(<ModActionCard action={baseAction} />);
    // Pubkeys render through shortNpub() so the user sees a recognizable
    // "npub1abcd…" form instead of raw hex — see src/lib/mentions.ts.
    expect(screen.getByText(shortNpub(baseAction.targetPubkey))).toBeInTheDocument();
  });

  it('handles null target', () => {
    render(<ModActionCard action={{ ...baseAction, targetPubkey: null }} />);
    expect(screen.getByTestId('mod-action')).toBeInTheDocument();
  });
});
