import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SettingRow from '@/components/ui/SettingRow';
import Toggle from '@/components/ui/Toggle';

describe('SettingRow', () => {
  it('lays out label, muted description and the control', () => {
    render(<SettingRow label="Sounds" description="Play a chime" control={<span>ctl</span>} data-testid="row" />);
    expect(screen.getByTestId('row')).toHaveClass('flex', 'items-start', 'justify-between', 'gap-4');
    expect(screen.getByText('Sounds')).toHaveClass('text-sm', 'text-lc-white');
    expect(screen.getByText('Play a chime')).toHaveClass('mt-0.5', 'text-xs', 'text-lc-muted');
    expect(screen.getByText('ctl')).toBeInTheDocument();
  });

  it('a function control gets the ids to name and describe itself', () => {
    render(
      <SettingRow
        label="Sounds"
        description="Play a chime"
        control={({ labelId, descriptionId }) => (
          <Toggle checked onChange={() => {}} aria-labelledby={labelId} aria-describedby={descriptionId} />
        )}
      />,
    );
    const toggle = screen.getByRole('switch', { name: 'Sounds' });
    expect(toggle).toHaveAccessibleDescription('Play a chime');
  });

  it('htmlFor renders a real label for a native field', () => {
    render(<SettingRow label="Relay" htmlFor="f" control={<input id="f" />} />);
    expect(screen.getByLabelText('Relay').tagName).toBe('INPUT');
  });

  it('without a description there is no description id', () => {
    let seen: string | undefined = 'unset';
    render(<SettingRow label="x" control={({ descriptionId }) => { seen = descriptionId; return null; }} />);
    expect(seen).toBeUndefined();
  });
});
