import { describe, it, expect, beforeEach } from 'vitest';
import { useNavStore } from './nav';

describe('useNavStore', () => {
  beforeEach(() => {
    useNavStore.setState(useNavStore.getInitialState());
  });

  it('starts with hero as active section', () => {
    expect(useNavStore.getState().activeSection).toBe('hero');
  });

  it('updates active section', () => {
    useNavStore.getState().setActiveSection('features');
    expect(useNavStore.getState().activeSection).toBe('features');
  });

  it('can switch between sections', () => {
    useNavStore.getState().setActiveSection('roadmap');
    expect(useNavStore.getState().activeSection).toBe('roadmap');

    useNavStore.getState().setActiveSection('hero');
    expect(useNavStore.getState().activeSection).toBe('hero');
  });
});
