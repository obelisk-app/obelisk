import { create } from 'zustand';

interface ZapStore {
  pickerOpen: { channelId: string; target?: string; amountSats?: number } | null;
  setPickerOpen: (v: ZapStore['pickerOpen']) => void;
}

export const useZapStore = create<ZapStore>((set) => ({
  pickerOpen: null,
  setPickerOpen: (v) => set({ pickerOpen: v }),
}));
