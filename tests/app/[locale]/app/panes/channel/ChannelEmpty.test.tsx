import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { groupFixture } from '@tests/support/mocks/nostr-bridge';
import { LocaleProvider } from '@tests/support/intl';
import { ChannelEmpty } from '@/app/[locale]/app/panes/channel/ChannelEmpty';
import type { ChannelEmptyStage } from '@/utils/chat/timeline/channel-list-state';

function mount(stage: ChannelEmptyStage, group = groupFixture({ id: 'g', name: 'general', kind: 'text' }) as never) {
  return render(<LocaleProvider initialLocale="en"><ChannelEmpty groupId={'f'.repeat(64)} group={group} stage={stage} /></LocaleProvider>);
}

describe('ChannelEmpty', () => {
  it('shows the spinner with the stage it is waiting on', () => {
    mount('loading-messages');
    expect(screen.getByTestId('messages-loading').getAttribute('data-stage')).toBe('messages');
    expect(screen.getByText('Loading messages...')).toBeInTheDocument();
  });

  it('welcomes to a known channel with no messages', () => {
    mount('welcome');
    expect(screen.getByText('Welcome to #general')).toBeInTheDocument();
    expect(screen.getByText('No messages yet. Be the first.')).toBeInTheDocument();
  });

  it('explains a channel the relay does not show, naming 16 characters of its id', () => {
    mount('welcome', null as never);
    expect(screen.getByText('Channel not visible on this relay')).toBeInTheDocument();
    expect(screen.getByText(/The link points to f{16}\.\.\., but/)).toBeInTheDocument();
  });
});
