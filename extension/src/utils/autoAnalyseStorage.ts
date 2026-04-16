/**
 * Storage for Auto Analyse toggle state.
 * Used by both the sidebar (AutoAnalyseToggle) and content script (PageSidebar).
 */

import { getExtensionApi, isInvalidatedError } from './extensionContext';

const STORAGE_KEY = 'eziterms_auto_analyse_enabled';
export const DEFAULT_AUTO_ANALYSE_ENABLED = true;

export async function getAutoAnalyseEnabled(): Promise<boolean> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return DEFAULT_AUTO_ANALYSE_ENABLED;
    const r = await ext.storage.local.get([STORAGE_KEY]);
    const val = r[STORAGE_KEY];
    if (val === false || val === true) return val;
    return DEFAULT_AUTO_ANALYSE_ENABLED;
  } catch (e) {
    if (isInvalidatedError(e)) return DEFAULT_AUTO_ANALYSE_ENABLED;
    return DEFAULT_AUTO_ANALYSE_ENABLED;
  }
}

export async function setAutoAnalyseEnabled(enabled: boolean): Promise<void> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return;
    await ext.storage.local.set({ [STORAGE_KEY]: enabled });
  } catch (e) {
    if (isInvalidatedError(e)) return;
    throw e;
  }
}
