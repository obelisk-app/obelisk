import { create } from 'zustand';

export type SettingsSection = 'perfil' | 'apariencia' | 'wallet' | 'invitaciones' | 'actividad' | 'cuenta' | 'notifications';

interface SettingsState {
  isOpen: boolean;
  section: SettingsSection;
  open: (section?: SettingsSection) => void;
  close: () => void;
  setSection: (s: SettingsSection) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  isOpen: false,
  section: 'perfil',
  open: (section) => set((s) => ({ isOpen: true, section: section ?? s.section })),
  close: () => set({ isOpen: false }),
  setSection: (section) => set({ section }),
}));
