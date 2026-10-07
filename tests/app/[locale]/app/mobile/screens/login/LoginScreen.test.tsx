import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LoginScreen } from '@/app/[locale]/app/mobile/screens/login/LoginScreen';

vi.mock('@/app/[locale]/app/login/LoginModal', () => ({
  default: ({ methods, headerSlot }: { methods: string[]; headerSlot: ReactNode }) => (
    <div data-testid="login-modal" data-methods={methods.join(',')}>{headerSlot}</div>
  ),
}));

describe('LoginScreen', () => {
  it('opens the login modal without the extension method, under the obelisk mark', () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId('login-modal')).toHaveAttribute('data-methods', 'nip46,generate,import');
    expect(getByTestId('login-modal').querySelector('svg.login-mark')).not.toBeNull();
  });
});
