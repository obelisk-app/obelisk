import { useConcordNavigation } from '@/store/chat/concord';
export function useConcordAdded(onClose: () => void) {
  return (id: string) => { onClose(); useConcordNavigation.getState().selectCommunity(id); };
}
