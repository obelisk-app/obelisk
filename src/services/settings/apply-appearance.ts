import { getAppearanceCssVariables, type Preferences } from '@/services/preferences/preferences';

/** Paint the appearance preferences on the page root: the colour variables and the bubble animation. */
export function applyAppearance(root: HTMLElement, prefs: Preferences): void {
  for (const [name, value] of Object.entries(getAppearanceCssVariables(prefs))) {
    root.style.setProperty(name, value);
  }
  root.dataset.bubbleAnimation = prefs.bubbleAnimation;
}
