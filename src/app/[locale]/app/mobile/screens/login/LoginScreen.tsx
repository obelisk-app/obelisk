'use client';

import LoginModal from '../../../login/LoginModal';
import ObeliskTwoToneMark from '@/assets/brand/ObeliskTwoToneMark';

// nip07 is intentionally omitted on mobile - browser extensions don't run on
// phones, and showing the option just leads to "no extension" errors. The
// desktop shell still offers all four.
const MOBILE_LOGIN_METHODS = ['nip46', 'generate', 'import'] as const;

export function LoginScreen() {
  // Mount the SDK login modal directly - no pre-picker. Going through an
  // intermediate screen made every method appear twice (once in our picker
  // and once in the SDK's flat list). The obelisk hero is forwarded via
  // `headerSlot` so we keep the brand at the top of the modal.
  return (
    <div className="screen login-screen active" data-screen="login">
      <LoginModal
        methods={[...MOBILE_LOGIN_METHODS]}
        headerSlot={<ObeliskTwoToneMark className="login-mark" fill="currentColor" aria-hidden="true" />}
      />
    </div>
  );
}
