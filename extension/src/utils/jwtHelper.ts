/**
 * Decode JWT payload (base64) to get user_id from 'sub' claim.
 * Used only for API calls that need user_id; we do not verify the token here.
 */
export function getUserIdFromToken(accessToken: string | null): number | null {
  if (!accessToken) return null;
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    const sub = payload.sub;
    if (sub == null) return null;
    return parseInt(String(sub), 10);
  } catch {
    return null;
  }
}
