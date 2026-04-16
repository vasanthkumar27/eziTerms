/**
 * Extension context helpers - guard against "Extension context invalidated" when
 * extension is reloaded while content scripts are still on open pages.
 */

const EXT_INVALIDATED = 'Extension context invalidated';

export function isExtensionContextValid(): boolean {
  try {
    const ext = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    return !!(ext?.runtime?.id);
  } catch {
    return false;
  }
}

export function isInvalidatedError(e: unknown): boolean {
  if (e instanceof Error) return e.message?.includes(EXT_INVALIDATED) ?? false;
  return String(e).includes(EXT_INVALIDATED);
}

/** Safely get chrome/browser API - returns null if context invalidated. */
export function getExtensionApi(): typeof chrome | null {
  try {
    const ext = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);
    if (ext?.runtime?.id) return ext;
    return null;
  } catch {
    return null;
  }
}

/** Wrap an async fn that uses chrome APIs - catches invalidated and returns fallback. */
export async function withExtensionContext<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    if (!isExtensionContextValid()) return fallback;
    return await fn();
  } catch (e) {
    if (isInvalidatedError(e)) return fallback;
    throw e;
  }
}

/** Run fn with chrome APIs; on "Extension context invalidated" return fallback. */
export function safeExt<T>(fn: (ext: NonNullable<ReturnType<typeof getExtensionApi>>) => T, fallback: T): T {
  try {
    const ext = getExtensionApi();
    if (!ext) return fallback;
    return fn(ext);
  } catch (e) {
    if (isInvalidatedError(e)) return fallback;
    throw e;
  }
}
