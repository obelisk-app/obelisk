import type { AppearancePreferences } from '@/types/preferences/appearance';
import { getAppearanceCssVariables } from '@/utils/preferences/appearance';

/** One DOM contract for initial paint and subsequent changes. */
export function applyAppearance(root: HTMLElement, appearance: AppearancePreferences): void {
  for (const [name, value] of Object.entries(getAppearanceCssVariables(appearance))) {
    if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
  }
  root.dataset.bubbleAnimation = appearance.bubbleAnimation;
}
