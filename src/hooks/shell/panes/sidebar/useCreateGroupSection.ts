'use client';

import { useState } from 'react';
import { useForm } from '@/hooks/common/useForm';
import { createChannelForm } from '@/services/chat/channel/create-channel-form';

/**
 * The desktop new-channel form's view model: whether it is unfolded, and the
 * common form over `createChannelForm`. Creating a channel folds the form and
 * hands the new id on; folding it by hand clears what was typed.
 */
export function useCreateGroupSection(onCreated: (groupId: string) => void) {
  const [open, setOpen] = useState(false);
  const form = useForm(createChannelForm((id) => {
    setOpen(false);
    onCreated(id);
  }));
  return {
    open,
    form,
    toggle: () => {
      if (open) form.reset();
      setOpen((v) => !v);
    },
  };
}
