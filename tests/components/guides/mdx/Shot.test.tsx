import { describe, it, expect } from 'vitest';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider, translator } from '@tests/support/intl';
import type { Locale } from '@/i18n';
import Shot from '@/components/guides/mdx/Shot';
import { SHOT_META } from '@/constants/guides/shots';

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('Shot', () => {
  it('renders the screenshot with its alt text and intrinsic size', () => {
    render(<Shot name="games/chain-reaction-board" />);
    const img = screen.getByAltText(translator('en')(SHOT_META['games/chain-reaction-board'].altKey));
    expect(img.getAttribute('src')).toBe('/og/guides/games/chain-reaction-board.png');
    expect(img.getAttribute('width')).toBe('420');
    expect(img.getAttribute('height')).toBe('484');
  });

  it('describes the screenshot in the reader\'s language', () => {
    render(<Shot name="games/vesta-board" />, 'pt');
    expect(screen.getByAltText(translator('pt')(SHOT_META['games/vesta-board'].altKey))).toBeTruthy();
    expect(translator('pt')(SHOT_META['games/vesta-board'].altKey)).toMatch(/^Tabuleiro do Vesta/);
  });

  it('renders a caption when given one', () => {
    render(<Shot name="games/stacker-well" caption="A well mid-match" />);
    expect(screen.getByText('A well mid-match')).toBeTruthy();
  });

  it('renders nothing for an unknown shot rather than a broken image', () => {
    const { container } = render(<Shot name="not-a-shot" />);
    expect(container.firstChild).toBeNull();
  });
});
