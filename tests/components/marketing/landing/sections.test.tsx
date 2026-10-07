import type { ImgHTMLAttributes, ReactElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import LandingHero from '@/components/marketing/landing/LandingHero';
import PreviewSection from '@/components/marketing/landing/PreviewSection';
import CtaSection from '@/components/marketing/landing/CtaSection';
import FeaturesSection from '@/components/marketing/landing/FeaturesSection';
import StepsSection from '@/components/marketing/landing/StepsSection';
import RoadmapSection from '@/components/marketing/landing/RoadmapSection';
import LearnSection from '@/components/marketing/landing/LearnSection';
import StackSection from '@/components/marketing/landing/StackSection';
import FaqSection from '@/components/marketing/landing/FaqSection';
import RelayPulse from '@/assets/illustrations/marketing/RelayPulse';
import { FAQ_IDS, FEATURE_KEYS, LEARN_GUIDES, ROADMAP_PHASES, TECH_STACK } from '@/constants/marketing/landing';

vi.mock('next/image', () => ({
  default: ({ src, alt, priority, sizes, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string; priority?: boolean }) => {
    void priority;
    void sizes;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...props} />;
  },
}));

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

const renderEn = (ui: ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('landing sections', () => {
  beforeEach(() => { vi.stubGlobal('IntersectionObserver', MockIntersectionObserver); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('the hero, preview and CTA launch buttons call onLaunch', () => {
    const onLaunch = vi.fn();
    renderEn(<><LandingHero onLaunch={onLaunch} /><PreviewSection onLaunch={onLaunch} /><CtaSection onLaunch={onLaunch} /></>);
    const hero = screen.getByTestId('landing-hero');
    fireEvent.click(within(hero).getAllByRole('button')[0]);
    screen.getAllByRole('button').forEach((b) => fireEvent.click(b));
    expect(onLaunch).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('landing-preview-desktop')).toHaveAttribute('href', '/desktop');
    expect(screen.getByTestId('landing-preview-mobile')).toHaveAttribute('href', '/mobile');
  });

  it('the launch buttons are the large pill Button; the GitHub link shares its look', () => {
    renderEn(<><LandingHero onLaunch={() => {}} /><PreviewSection onLaunch={() => {}} /><CtaSection onLaunch={() => {}} /></>);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('lc-pill-primary', 'text-base', 'focus-visible:ring-2');
      expect(button).toHaveAttribute('type', 'button');
      // The stylesheet's pill padding always won; the dead utilities are gone.
      expect(button.className).not.toMatch(/\bp[xy]-/);
    }
    const github = within(screen.getByTestId('landing-hero')).getByRole('link', { name: /github/i });
    expect(github).toHaveClass('lc-pill-secondary', 'text-base');
  });

  it('data-driven sections render one card per entry', () => {
    const { container } = renderEn(
      <><FeaturesSection /><StepsSection /><RoadmapSection /><LearnSection /><StackSection /></>,
    );
    expect(container.querySelector('#features')?.querySelectorAll('.lc-card')).toHaveLength(FEATURE_KEYS.length);
    expect(container.querySelector('#how-it-works')?.querySelectorAll('.lc-card')).toHaveLength(3);
    expect(container.querySelector('#roadmap')?.querySelectorAll('.lc-card')).toHaveLength(ROADMAP_PHASES.length);
    expect(container.querySelector('#learn')?.querySelectorAll('a.lc-card')).toHaveLength(LEARN_GUIDES.length);
    const stack = container.querySelector('#stack');
    expect(stack?.querySelectorAll('a[target="_blank"]')).toHaveLength(TECH_STACK.length);
  });

  it('the roadmap phases are h3 under the section h2, no level skipped', () => {
    const { container } = renderEn(<RoadmapSection />);
    const section = container.querySelector('#roadmap') as HTMLElement;
    expect(within(section).getAllByRole('heading', { level: 2 })).toHaveLength(1);
    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(ROADMAP_PHASES.length);
    expect(within(section).queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });

  it('the FAQ renders every question and a matching FAQPage JSON-LD', () => {
    const { container } = renderEn(<FaqSection />);
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(FAQ_IDS.length);
    expect(screen.getByText(ld.mainEntity[0].name)).toBeInTheDocument();
  });

  it('the relay pulse is decorative', () => {
    const { container } = render(<RelayPulse />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('circle')).toHaveLength(5);
  });
});
