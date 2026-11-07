import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import ZapPresets from '@/components/settings/wallet/ZapPresets';
import { getPreferences, setPreference } from '@/services/preferences/preferences';
import { DEFAULT_ZAP_PRESETS } from '@/constants/wallet/zap';

describe('ZapPresets', () => {
  it('edits and persists a base amount without requiring a wallet', async () => {
    setPreference('zapPresets', DEFAULT_ZAP_PRESETS);
    renderWithBridge(<ZapPresets />, fakeBridge());
    fireEvent.change(screen.getAllByLabelText('Amount (sats)')[0], { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(getPreferences().zapPresets[0].amountSats).toBe(42));
    setPreference('zapPresets', DEFAULT_ZAP_PRESETS);
  });
});
