'use client';

import LoginModal from '../../../login/LoginModal';

// nip07 is intentionally omitted on mobile - browser extensions don't run on
// phones, and showing the option just leads to "no extension" errors. The
// desktop shell still offers all four.
const MOBILE_LOGIN_METHODS = ['nip46', 'generate', 'import'] as const;

const LoginObeliskMark = () => (
  <svg className="login-mark" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
    <path d="M256,16 L220,72 L196,460 L200,464 L256,464 L256,72 Z" opacity="0.7" />
    <path d="M256,16 L292,72 L316,460 L312,464 L256,464 L256,72 Z" />
  </svg>
);

export function LoginScreen() {
  // Mount the SDK login modal directly - no pre-picker. Going through an
  // intermediate screen made every method appear twice (once in our picker
  // and once in the SDK's flat list). The obelisk hero is forwarded via
  // `headerSlot` so we keep the brand at the top of the modal.
  return (
    <div className="screen login-screen active" data-screen="login">
      <LoginModal
        methods={[...MOBILE_LOGIN_METHODS]}
        headerSlot={<LoginObeliskMark />}
      />
    </div>
  );
}
