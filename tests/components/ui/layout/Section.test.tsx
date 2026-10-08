import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Section from '@/components/ui/layout/Section';

describe('Section', () => {
  it('preserves anchors, content and introductory article typography', () => {
    render(<Section id="topic" title="Topic" description="Introduction" data-testid="section"><span>Content</span></Section>);
    const section = screen.getByTestId('section');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('id', 'topic');
    expect(section).toHaveClass('scroll-mt-24');
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass('sm:text-3xl');
    expect(screen.getByText('Introduction').tagName).toBe('P');
    expect(section).toContainElement(screen.getByText('Content'));
  });

  it('supports prose sections and independent heading levels without an empty description', () => {
    render(<Section title="Details" variant="prose" headingAs="h3" className="extra" data-testid="section">Body</Section>);
    expect(screen.getByRole('heading', { level: 3 })).toHaveClass('text-xl', 'font-bold');
    expect(screen.getByTestId('section')).toHaveClass('mt-10', 'leading-7', 'extra');
    expect(screen.getByTestId('section').querySelector('p')).toBeNull();
  });
});

it('shares the phone section recipe and renders a semantic heading', () => {
  render(<Section variant="mobile" headingAs="h3" title="Preferences" id="prefs"><button>Change</button></Section>);
  const title = screen.getByRole('heading', { name: 'Preferences', level: 3 });
  expect(title).toHaveClass('settings-section-title');
  expect(title.parentElement).toHaveClass('settings-section');
  expect(title.parentElement).toHaveAttribute('id', 'prefs');
  expect(screen.getByRole('button', { name: 'Change' }).parentElement).toBe(title.parentElement);
});


it('uses the compact desktop settings heading without wrapping its content', () => {
  render(<Section variant="settings" headingAs="h3" title="Wallet" className="space-y-3" data-testid="wallet"><button>Connect</button></Section>);
  const title = screen.getByRole('heading', { name: 'Wallet', level: 3 });
  expect(title).toHaveClass('text-xs', 'font-semibold', 'uppercase', 'text-lc-muted');
  const section = screen.getByTestId('wallet');
  expect(section).toHaveClass('space-y-3');
  expect(section).not.toHaveClass('settings-section');
  expect(screen.getByRole('button', { name: 'Connect' }).parentElement).toBe(section);
});

it('applies a mobile body recipe without wrapping or moving its title', () => {
  render(<Section variant="mobile" headingAs="h3" title="Wallet" contentClassName="settings-row !block space-y-3"><button>Connect</button></Section>);
  const title = screen.getByRole('heading', { name: 'Wallet', level: 3 });
  const body = screen.getByRole('button', { name: 'Connect' }).parentElement;
  expect(body).toHaveClass('settings-row', '!block', 'space-y-3');
  expect(body?.parentElement).toBe(title.parentElement);
  expect(title.parentElement).toHaveClass('settings-section');
});
