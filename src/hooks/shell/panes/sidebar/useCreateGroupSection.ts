'use client';

import { useState } from 'react';
import { useCreateChannelForm } from '@/hooks/chat/channel/useCreateChannelForm';

/**
 * The desktop new-channel form's view model: whether it is unfolded, and
 * the shared `useCreateChannelForm`. Creating a channel folds the form and
 * hands the new id on; folding it by hand clears what was typed.
 */
export function useCreateGroupSection(onCreated: (groupId: string) => void) {
  const [open, setOpen] = useState(false);
  const form = useCreateChannelForm((id) => {
    setOpen(false);
    onCreated(id);
  });
  return {
    open,
    form,
    toggle: () => {
      if (open) form.reset();
      setOpen((v) => !v);
    },
  };
}
