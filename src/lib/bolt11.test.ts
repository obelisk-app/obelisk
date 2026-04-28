import { describe, it, expect } from 'vitest';
import { parseBolt11, INVOICE_REGEX } from './bolt11';

// A real mainnet BOLT11 invoice (5000 sats = 50u).
const SAMPLE =
  'lnbc50u1p578m3kpp50752uwel3lspe0858p4ersrmekd5u80mm6vqx2htcyaugndqkfrsdq02fy4gjpqfeq574ccqzysxqyz5vqrzjqv3dpepm8kfdxrk3sl6wzqdf49s9c0h9ljtjrek6c08r6aejlwcnur0dwyqqvucqqqqqqqlgqqqq86qqjqsp5uzydhtzxp6924vpj3ew57cd0r7q6l0k34278jjkfdjwn26xukmss9qxpqysgq5pqal556rh20xzt7eercjrxqfcpdl287e78yp6yzpvxuqqqccc73ujxxv43gwgrceuwe2mutwapkaedd7n0secjqq680kkvx56z662sqj5v99t';

describe('bolt11', () => {
  it('parses payment_hash and amount in sats', () => {
    const p = parseBolt11(SAMPLE);
    expect(p.paymentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(p.amountSats).toBe(5000);
    expect(p.expiresAt).toBeGreaterThan(p.timestamp);
  });

  it('INVOICE_REGEX extracts a full invoice from surrounding text', () => {
    const text = `Hi pay this: ${SAMPLE} thanks`;
    const matches = text.match(INVOICE_REGEX);
    expect(matches).toEqual([SAMPLE]);
  });
});
