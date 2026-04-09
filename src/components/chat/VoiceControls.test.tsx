import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import VoiceControls from './VoiceControls';

describe('VoiceControls', () => {
  it('renders mute, deafen, and leave buttons', () => {
    render(
      <VoiceControls
        isMuted={false}
        isDeafened={false}
        onToggleMute={vi.fn()}
        onToggleDeafen={vi.fn()}
        onLeave={vi.fn()}
      />
    );
    expect(screen.getByTestId('mute-btn')).toBeInTheDocument();
    expect(screen.getByTestId('deafen-btn')).toBeInTheDocument();
    expect(screen.getByTestId('leave-voice-btn')).toBeInTheDocument();
  });

  it('calls onToggleMute when mute clicked', async () => {
    const onMute = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceControls isMuted={false} isDeafened={false} onToggleMute={onMute} onToggleDeafen={vi.fn()} onLeave={vi.fn()} />
    );
    await user.click(screen.getByTestId('mute-btn'));
    expect(onMute).toHaveBeenCalled();
  });

  it('calls onLeave when disconnect clicked', async () => {
    const onLeave = vi.fn();
    const user = userEvent.setup();
    render(
      <VoiceControls isMuted={false} isDeafened={false} onToggleMute={vi.fn()} onToggleDeafen={vi.fn()} onLeave={onLeave} />
    );
    await user.click(screen.getByTestId('leave-voice-btn'));
    expect(onLeave).toHaveBeenCalled();
  });

  it('shows muted styling when muted', () => {
    render(
      <VoiceControls isMuted={true} isDeafened={false} onToggleMute={vi.fn()} onToggleDeafen={vi.fn()} onLeave={vi.fn()} />
    );
    expect(screen.getByTestId('mute-btn').className).toContain('bg-red-600/20');
  });
});
