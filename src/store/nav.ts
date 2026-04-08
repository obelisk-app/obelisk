import { create } from 'zustand';

export type Section = 'hero' | 'features' | 'how-it-works' | 'roadmap';

interface NavState {
  activeSection: Section;
  setActiveSection: (section: Section) => void;
}

export const useNavStore = create<NavState>()((set) => ({
  activeSection: 'hero',
  setActiveSection: (section) => set({ activeSection: section }),
}));
