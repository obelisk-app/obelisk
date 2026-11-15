import { useEffect } from 'react';
import { useIsLoggedIn } from '@/hooks/session/useSession';
import { useConcordNavigation } from '@/store/chat/concord';
import { captureConcordInviteFragment, clearPendingConcordInvite } from '@/services/chat/concord/pending-invite';

export function useConcordRoot() {
  const loggedIn = useIsLoggedIn();
  const open = useConcordNavigation(state => state.open);
  useEffect(() => {
    if (!loggedIn) { clearPendingConcordInvite(); return; }
    const capture = () => {
      if (captureConcordInviteFragment()) useConcordNavigation.getState().selectCommunity('');
    };
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, [loggedIn]);
  return loggedIn && open;
}
