import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import SheetHeader from '@/app/[locale]/app/mobile/sheets/SheetHeader';

const en = (node: React.ReactNode) => render(<LocaleProvider initialLocale="en"><div data-testid="sheet">{node}</div></LocaleProvider>);

describe('SheetHeader', () => {
  it('title: the centred zap-title h2 with its glyph, and the help line as a sibling', () => {
    en(<SheetHeader icon={<svg data-testid="glyph" />} title="New channel" subtitle="Pick a name" titleTestId="t" />);
    const title = screen.getByRole('heading', { level: 2, name: 'New channel' });
    expect(title).toHaveClass('zap-title');
    expect(title).toHaveAttribute('data-testid', 't');
    expect(title.firstElementChild).toBe(screen.getByTestId('glyph'));
    const help = screen.getByText('Pick a name');
    expect(help.tagName).toBe('P');
    expect(help).toHaveClass('sheet-subtitle');
    // a fragment: the title row and the help line are direct children of the sheet
    const sheet = screen.getByTestId('sheet');
    expect(sheet.children).toHaveLength(2);
    expect(sheet.firstElementChild).toHaveClass('sheet-title-row');
  });

  it('title: no help line and no back button unless asked for', () => {
    const { container } = en(<SheetHeader title="Sort" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Sort' })).toBeInTheDocument();
    expect(container.querySelector('.sheet-subtitle')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('title: a back chevron before the title for a sub-view', () => {
    const onBack = vi.fn();
    en(<SheetHeader title="Mute" onBack={onBack} />);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back).toHaveClass('back-btn', 'sheet-title-back');
    expect(back.closest('.sheet-title-row')).not.toBeNull();
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('title: the back chevron takes a custom accessible name', () => {
    en(<SheetHeader title="Mute" onBack={vi.fn()} backLabel="Channel menu" />);
    expect(screen.getByRole('button', { name: 'Channel menu' })).toBeInTheDocument();
  });

  it('confirm: the tinted icon circle, the title and the description', () => {
    const { container } = en(<SheetHeader variant="confirm" icon={<svg data-testid="glyph" />} title="Disconnect?" subtitle="You can log back in" />);
    const circle = container.querySelector('.confirm-sheet-icon');
    expect(circle).toHaveAttribute('aria-hidden', 'true');
    expect(circle).toContainElement(screen.getByTestId('glyph'));
    expect(screen.getByRole('heading', { level: 2, name: 'Disconnect?' })).toHaveClass('confirm-sheet-title');
    expect(screen.getByText('You can log back in')).toHaveClass('confirm-sheet-desc');
    expect(screen.getByTestId('sheet').children).toHaveLength(3);
  });

  it('identity: the avatar beside the name and the mono line', () => {
    const { container } = en(<SheetHeader variant="identity" media={<div data-testid="avatar" />} title="La Crypta" subtitle="relay.example" />);
    const row = container.querySelector('.sheet-identity');
    expect(row?.firstElementChild).toBe(screen.getByTestId('avatar'));
    expect(screen.getByRole('heading', { level: 2, name: 'La Crypta' })).toHaveClass('sheet-identity-name');
    expect(screen.getByText('relay.example')).toHaveClass('sheet-identity-sub');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
