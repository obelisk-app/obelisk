import { applyAppearance } from '../../src/services/preferences/appearance-dom';
import { loadAppearancePreferences } from '../../src/services/preferences/appearance-storage';

applyAppearance(document.documentElement, loadAppearancePreferences());
