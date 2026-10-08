import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import Checkbox from '@/components/ui/forms/Checkbox';

describe.each([{ name: 'Input', Control: Input }, { name: 'TextArea', Control: TextArea }, { name: 'Select', Control: Select }, { name: 'Checkbox', Control: Checkbox }])('$name field descriptions', ({ Control }) => {
  it('keeps both its own note and caller descriptions as hints become errors', () => {
    const view = (error?: string) => <>
      <span id="external">External description</span>
      <Control id="control" label="Field" data-testid="control" hint="Helpful hint" error={error} aria-describedby="external" />
    </>;
    const { rerender } = render(view());
    expect(screen.getByTestId('control')).toHaveAttribute('aria-describedby', 'control-note external');
    expect(screen.getByTestId('control')).toHaveAccessibleDescription('Helpful hint External description');
    rerender(view('Required'));
    expect(screen.getByTestId('control')).toHaveAccessibleDescription('Required External description');
  });

  it('preserves external descriptions without adding a missing note', () => {
    render(<><span id="external">External description</span><Control label="Field" data-testid="control" aria-describedby="external" /></>);
    expect(screen.getByTestId('control')).toHaveAttribute('aria-describedby', 'external');
    expect(screen.getByTestId('control')).toHaveAccessibleDescription('External description');
  });
});

it('keeps external descriptions on a checkbox without a visible label', () => {
  render(<><span id="external">External description</span><Checkbox aria-label="Select row" data-testid="control" aria-describedby="external" /></>);
  expect(screen.getByTestId('control')).toHaveAccessibleDescription('External description');
});
