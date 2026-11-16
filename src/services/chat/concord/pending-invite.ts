let pending = '';

/** Invitation tokens stay in memory. Fragments are never sent to the web server. */
export function readPendingConcordInvite() { return pending; }
export function clearPendingConcordInvite() { pending = ''; }

export function captureConcordInviteFragment(removeFromAddress = true) {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const invitation = fragment.get('concord-invite');
  if (!invitation) return false;
  pending = invitation;
  // Remove the token from this history entry once the authenticated app has it.
  if (removeFromAddress) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  return true;
}
