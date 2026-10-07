'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * The landing page's view model: the call-to-action buttons go to the app,
 * and a login finished from the navbar shows a spinner while it does.
 *
 * It does not send a visitor who is already signed in to `/app` on its own:
 * the landing page must stay reachable from the app and by its URL, even
 * with a session saved in this browser.
 */
export function useLandingPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  return {
    isNavigating,
    launch: () => router.push('/app'),
    onLoginSuccess: () => {
      setIsNavigating(true);
      router.push('/app');
    },
  };
}
