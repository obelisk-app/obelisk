import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import YouTubeEmbed from './YouTubeEmbed';

describe('YouTubeEmbed', () => {
  it('renders thumbnail by default', () => {
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    const btn = screen.getByTestId('youtube-thumbnail');
    expect(btn).toBeInTheDocument();
    const img = btn.querySelector('img');
    expect(img?.src).toContain('dQw4w9WgXcQ');
  });

  it('loads iframe on click', async () => {
    const user = userEvent.setup();
    render(<YouTubeEmbed videoId="dQw4w9WgXcQ" />);
    await user.click(screen.getByTestId('youtube-thumbnail'));
    const iframe = screen.getByTestId('youtube-iframe').querySelector('iframe');
    expect(iframe?.src).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});
