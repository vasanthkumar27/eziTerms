// Priority: explicit VITE_API_BASE_URL override > VITE_USE_AWS toggle.
const envOverride = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
  ? String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '')
  : '';
const useAws = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_AWS)
  ? ['true', '1', 'yes'].includes(String(import.meta.env.VITE_USE_AWS).toLowerCase())
  : false;
const bootstrapUrl = envOverride
  || (useAws ? 'https://api.haptix.in/api' : 'http://localhost:8000/api');

const envWebsite = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_WEBSITE_BASE_URL)
  ? String(import.meta.env.VITE_WEBSITE_BASE_URL).trim().replace(/\/$/, '')
  : '';
const websiteBaseUrl = envWebsite || (useAws ? 'https://distil.haptix.in' : 'http://localhost:5173');

export function getWebsiteBaseUrl(): string {
  return websiteBaseUrl;
}

let cachedBaseUrl = bootstrapUrl;

export async function fetchConfig(): Promise<void> {
  try {
    const res = await fetch(`${bootstrapUrl}/config/public`);
    const data = await res.json().catch(() => ({}));
    if (data?.api_base_url) cachedBaseUrl = String(data.api_base_url).replace(/\/$/, '');
  } catch {
    // keep bootstrap
  }
}

export function getApiBaseUrl(): string {
  return cachedBaseUrl;
}

const API_ENDPOINTS = {
    get AWS_BASE_API_URL(): string {
      return getApiBaseUrl();
    },

    ANALYSE_TERMS: '/analyze-terms',
    UPLOAD_TERMS: '/upload-terms',
    CHATBOT_TEXT: '/chatbot',
    CLASSIFY_PAGE: '/classify-page',

    REFRESH_TOKEN: '/token/refresh',
    LOGOUT: '/logout',
    LOGIN_GOOGLE: '/google-login',
    LOGIN_GENERIC: '/login',
    SIGNUP_GENERIC: '/signup',
};

export default API_ENDPOINTS;
