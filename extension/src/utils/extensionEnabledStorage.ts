/**
 * Storage for extension on/off state.
 * When off: no floating bubble, no auto-analyse.
 */

import { getExtensionApi, isInvalidatedError } from './extensionContext';

const STORAGE_KEY = 'eziterms_extension_enabled';
export const DEFAULT_EXTENSION_ENABLED = true;

export async function getExtensionEnabled(): Promise<boolean> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return DEFAULT_EXTENSION_ENABLED;
    const r = await ext.storage.local.get([STORAGE_KEY]);
    const val = r[STORAGE_KEY];
    if (val === false || val === true) return val;
    return DEFAULT_EXTENSION_ENABLED;
  } catch (e) {
    if (isInvalidatedError(e)) return DEFAULT_EXTENSION_ENABLED;
    return DEFAULT_EXTENSION_ENABLED;
  }
}

export async function setExtensionEnabled(enabled: boolean): Promise<void> {
  try {
    const ext = getExtensionApi();
    if (!ext?.storage?.local) return;
    await ext.storage.local.set({ [STORAGE_KEY]: enabled });
  } catch (e) {
    if (isInvalidatedError(e)) return;
    throw e;
  }
}
