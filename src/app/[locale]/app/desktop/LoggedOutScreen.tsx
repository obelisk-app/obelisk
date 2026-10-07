'use client';

import ShootingStars from '@/components/ui/animations/ShootingStars';
import LoginModal from '../login/LoginModal';

/**
 * What a logged-out visitor sees: the login card over an animated backdrop
 * (matrix grid + shooting stars + green corner glows). The backdrop sits
 * behind the SDK modal (z-index 0; modal portal is at 9999). The la-crypta
 * overlay is dimmed in globals.css so the animation bleeds through around
 * the centered card.
 */
export function LoggedOutScreen() {
  return (
    <>
      <div className="lc-login-backdrop" aria-hidden="true">
        <div className="appearance-bg lc-grid-bg absolute inset-0" />
        <ShootingStars />
      </div>
      <LoginModal />
    </>
  );
}
