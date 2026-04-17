const BASE = import.meta.env.VITE_API_BASE_URL || '';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function getGoogleClientId() { return GOOGLE_CLIENT_ID; }

function tokens() {
  try {
    return {
      access: localStorage.getItem('access_token'),
      refresh: localStorage.getItem('refresh_token'),
    };
  } catch { return { access: null, refresh: null }; }
}

function setTokens(access, refresh) {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
  // Bump a dedicated key so other tabs get a `storage` event even if same-value.
  try { localStorage.setItem('distil_auth_tick', String(Date.now())); } catch {}
  window.dispatchEvent(new CustomEvent('distil-tokens-updated', {
    detail: { access, refresh },
  }));
  // Redundant broadcast via postMessage: CustomEvent.detail does not cross
  // Chrome extension isolated-world boundaries, but postMessage data does.
  try {
    window.postMessage({ type: 'DISTIL_AUTH_UPDATE', access, refresh }, window.location.origin);
  } catch {}
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('session_id');
  try { localStorage.setItem('distil_auth_tick', String(Date.now())); } catch {}
  window.dispatchEvent(new CustomEvent('distil-tokens-updated', { detail: { access: null, refresh: null } }));
  window.dispatchEvent(new CustomEvent('distil-logout'));
  try {
    window.postMessage({ type: 'DISTIL_AUTH_UPDATE', access: null, refresh: null }, window.location.origin);
  } catch {}
}

async function tryRefresh() {
  const { refresh } = tokens();
  if (!refresh) return null;
  try {
    const r = await fetch(`${BASE}/api/token/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.access) setTokens(d.access, d.refresh || refresh);
    return d.access || null;
  } catch { return null; }
}

export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const { access } = tokens();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (access) headers.Authorization = `Bearer ${access}`;
  let res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    const newAccess = await tryRefresh();
    if (newAccess) {
      headers.Authorization = `Bearer ${newAccess}`;
      res = await fetch(url, { ...opts, headers });
    } else {
      clearTokens();
    }
  }
  return res;
}

export async function apiPost(path, body) {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function apiGet(path) {
  const res = await apiFetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function apiDelete(path) {
  const res = await apiFetch(path, { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function apiUpload(path, file, extraFields = {}) {
  const url = `${BASE}${path}`;
  const fd = new FormData();
  fd.append('file', file);
  Object.entries(extraFields).forEach(([k, v]) => { if (v != null) fd.append(k, String(v)); });
  const { access } = tokens();
  const headers = {};
  if (access) headers.Authorization = `Bearer ${access}`;
  let res = await fetch(url, { method: 'POST', body: fd, headers });
  if (res.status === 401) {
    const newAccess = await tryRefresh();
    if (newAccess) {
      headers.Authorization = `Bearer ${newAccess}`;
      res = await fetch(url, { method: 'POST', body: fd, headers });
    }
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function loginWithGoogle(googleAccessToken) {
  const res = await fetch(`${BASE}/api/google-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: googleAccessToken }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  setTokens(data.access, data.refresh);
  return data;
}

export async function loginWithEmail(email, password) {
  const res = await fetch(`${BASE}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  setTokens(data.access, data.refresh);
  return data;
}

export async function signupWithEmail(email, password) {
  const res = await fetch(`${BASE}/api/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw { status: res.status, data };
  return data;
}

export async function logout() {
  const { refresh, access } = tokens();
  try {
    await fetch(`${BASE}/api/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      body: JSON.stringify({ refresh }),
    });
  } catch {}
  clearTokens();
}

export function isLoggedIn() {
  return !!tokens().access;
}
