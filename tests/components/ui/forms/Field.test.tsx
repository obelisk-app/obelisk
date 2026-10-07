import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Field, { fieldNoteId } from '@/components/ui/forms/Field';

describe('Field', () => {
  it('ties the label to the control', () => {
    render(
      <Field htmlFor="name" label="Name">
        <input id="name" />
      </Field>,
    );
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'name');
  });

  it('shows the hint, and the error wins over it as an alert', () => {
    const { rerender } = render(<Field htmlFor="x" hint="Optional"><input id="x" /></Field>);
    expect(screen.getByText('Optional')).toHaveAttribute('id', 'x-note');
    rerender(<Field htmlFor="x" hint="Optional" error="Required"><input id="x" /></Field>);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.queryByText('Optional')).toBeNull();
  });

  it('fieldNoteId only names a note that exists', () => {
    expect(fieldNoteId('x', true)).toBe('x-note');
    expect(fieldNoteId('x', false)).toBeUndefined();
  });
});
