import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Form from '@/components/ui/forms/Form';
import FormError from '@/components/ui/forms/FormError';

describe('Form', () => {
  it('wires the useForm state: id, submit, no browser validation, busy', () => {
    const submit = vi.fn();
    render(<Form form={{ id: 'f1', submit, submitting: true }} data-testid="f"><input aria-label="x" /></Form>);
    const form = screen.getByTestId('f');
    expect(form).toHaveAttribute('id', 'f1');
    expect(form).toHaveAttribute('novalidate');
    expect(form).toHaveAttribute('aria-busy', 'true');
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('takes its own handler when not on useForm, and can leave validation to the browser', () => {
    const onSubmit = vi.fn();
    render(<Form onSubmit={onSubmit} browserValidation data-testid="f" />);
    fireEvent.submit(screen.getByTestId('f'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('f')).not.toHaveAttribute('novalidate');
  });

  it('lays out by role', () => {
    const { rerender } = render(<Form layout="card" data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveClass('max-w-md', 'rounded-xl', 'space-y-4');
    rerender(<Form layout="sheet" data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveClass('flex', 'flex-col', 'gap-2.5');
    rerender(<Form layout="sections" className="extra" data-testid="f" />);
    expect(screen.getByTestId('f')).toHaveClass('space-y-7', 'p-5', 'extra');
  });

  it('draws its error last, as an alert, and nothing without one', () => {
    const { rerender } = render(<Form error={null}><span>field</span></Form>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Form error="Nope" errorVariant="box"><span>field</span></Form>);
    expect(screen.getByRole('alert')).toHaveTextContent('Nope');
    expect(screen.getByRole('alert')).toHaveClass('rounded-lg');
  });
});

describe('FormError', () => {
  it('has a look per place', () => {
    const { rerender } = render(<FormError>bad</FormError>);
    expect(screen.getByRole('alert')).toHaveClass('text-red-400');
    rerender(<FormError variant="sheet">bad</FormError>);
    expect(screen.getByRole('alert')).toHaveClass('text-[12px]');
    rerender(<FormError>{''}</FormError>);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
