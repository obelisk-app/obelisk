import { useEffect } from 'react';
import { useIsLoggedIn } from '@/hooks/session/useSession';
import { useConcordNavigation } from '@/store/chat/concord';
import { captureConcordInviteFragment, readPendingConcordInvite } from '@/services/chat/concord/pending-invite';

export function useConcordRoot() {
  const loggedIn = useIsLoggedIn();
  const open = useConcordNavigation(state => state.open);
  useEffect(() => {
    const capture = () => {
      captureConcordInviteFragment(loggedIn);
      if (loggedIn && readPendingConcordInvite()) useConcordNavigation.getState().selectCommunity('');
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, [loggedIn]);
  return loggedIn && open;
}
