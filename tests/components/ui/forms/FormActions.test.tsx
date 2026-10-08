import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FormActions from '@/components/ui/forms/FormActions';

describe('FormActions', () => {
  it('block: one full-width submit pill', () => {
    render(<FormActions submitLabel="Enter" />);
    const button = screen.getByRole('button', { name: 'Enter' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveClass('lc-pill-primary', 'w-full');
  });

  it('start: save then cancel; busy shows its label and disables both', () => {
    const onClick = vi.fn();
    const { rerender } = render(<FormActions variant="start" submitLabel="Save" busyLabel="Saving…" cancel={{ label: 'Cancel', onClick }} />);
    const [save, cancel] = screen.getAllByRole('button');
    expect(save).toHaveTextContent('Save');
    expect(cancel).toHaveTextContent('Cancel');
    fireEvent.click(cancel);
    expect(onClick).toHaveBeenCalled();
    rerender(<FormActions variant="start" submitLabel="Save" busyLabel="Saving…" busy cancel={{ label: 'Cancel', onClick }} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('end: right-aligned primary; sheet: the shell\'s full-width button, bound to a form by id', () => {
    const { rerender, container } = render(<FormActions variant="end" submitLabel="Add" disabled />);
    expect(container.firstChild).toHaveClass('justify-end');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    rerender(<FormActions variant="sheet" submitLabel="Add" form="f9" submitTestId="go" />);
    expect(screen.getByTestId('go')).toHaveClass('btn-primary');
    expect(screen.getByTestId('go')).toHaveAttribute('form', 'f9');
    expect(screen.getByTestId('go')).toHaveAttribute('type', 'submit');
  });
});
