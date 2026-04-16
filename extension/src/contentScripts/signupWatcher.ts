/**
 * Sign-up watcher — lives in the content script and runs on every non-Distil
 * page. When the user is about to submit a signup form that includes a
 * "terms / agree / accept" checkbox, we capture the linked T&C URL and surface
 * a tiny glass toast asking if they want to save it to the Distil watchlist.
 * On confirm, we forward a message to the extension background, which calls
 * the backend via the side-panel's stored auth.
 */

const TOAST_ID = 'distil-signup-toast';
const SAFE_HOST_BLOCKLIST = [
  'accounts.google.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
];

const TC_LINK_PATTERN = /(terms|tos|t&c|privacy|legal|eula|user.?agreement|conditions)/i;
const AGREE_HINT = /(agree|accept|consent|terms|conditions|policy|privacy)/i;

function isSafeHost(): boolean {
  try {
    return !SAFE_HOST_BLOCKLIST.includes(window.location.hostname);
  } catch {
    return false;
  }
}

function isDistilHost(): boolean {
  try {
    const h = window.location.hostname;
    return (
      h === 'haptix.in' ||
      h.endsWith('.haptix.in') ||
      h.endsWith('.preview.emergentagent.com') ||
      h === 'localhost' ||
      h === '127.0.0.1'
    );
  } catch {
    return false;
  }
}

function findTcLinkNear(form: HTMLFormElement): { url: string; title: string } | null {
  // Look inside the form first, then within the document.
  const scopes: HTMLElement[] = [form, document.body];
  for (const scope of scopes) {
    const anchors = Array.from(scope.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;
      const text = (a.textContent || '').trim();
      if (!TC_LINK_PATTERN.test(text) && !TC_LINK_PATTERN.test(href)) continue;
      try {
        const u = new URL(href, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
        return { url: u.toString(), title: text.slice(0, 120) || u.hostname };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function looksLikeSignupForm(form: HTMLFormElement): boolean {
  // Heuristics: at least one password input, at least one email/text input,
  // and either a checkbox whose label mentions agree/terms or a T&C link
  // somewhere inside the form.
  const pwd = form.querySelector('input[type="password"]');
  if (!pwd) return false;
  const email = form.querySelector('input[type="email"], input[name*="email" i], input[autocomplete*="email" i]');
  if (!email) return false;

  // Signup hint: either the submit button text or any visible heading says "sign up / create / register"
  const action = ((form.getAttribute('action') || '') + ' ' + (form.getAttribute('id') || '') + ' ' + (form.getAttribute('class') || '')).toLowerCase();
  const submitBtn = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  const submitText = ((submitBtn?.textContent || submitBtn?.getAttribute('value') || '')).toLowerCase();
  const signupHintFromForm = /sign.?up|register|create.?account|join/i.test(action + ' ' + submitText);

  // Agreement hint: checkbox whose label mentions agree/terms OR T&C link anywhere
  const checkboxes = Array.from(form.querySelectorAll('input[type="checkbox"]')) as HTMLInputElement[];
  let agreementHint = false;
  for (const cb of checkboxes) {
    const id = cb.id ? `label[for="${cb.id}"]` : '';
    const lbl = (id && (document.querySelector(id) as HTMLElement | null))
      || cb.closest('label') as HTMLElement | null;
    const txt = (lbl?.textContent || cb.getAttribute('aria-label') || '').trim();
    if (AGREE_HINT.test(txt)) { agreementHint = true; break; }
  }
  if (!agreementHint && findTcLinkNear(form)) agreementHint = true;

  return signupHintFromForm || agreementHint;
}

function dismissToast(): void {
  const existing = document.getElementById(TOAST_ID);
  if (existing) existing.remove();
}

function showToast(opts: {
  hostname: string;
  url: string;
  title: string;
  onSave: () => void;
}): void {
  dismissToast();
  const wrapper = document.createElement('div');
  wrapper.id = TOAST_ID;
  wrapper.setAttribute('data-testid', 'distil-signup-toast');
  wrapper.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'right:18px',
    'bottom:18px',
    'width:340px',
    'max-width:calc(100vw - 36px)',
    'color:#f6f6f7',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'font-size:13.5px',
    'line-height:1.45',
    'background:rgba(14,14,16,0.72)',
    '-webkit-backdrop-filter:saturate(200%) blur(22px)',
    'backdrop-filter:saturate(200%) blur(22px)',
    'border:1px solid rgba(255,255,255,0.14)',
    'border-radius:14px',
    'padding:14px 14px 12px',
    'box-shadow:0 20px 50px rgba(0,0,0,0.45)',
    'animation:eziToastIn .25s ease-out',
  ].join(';');

  // Inject keyframes once
  if (!document.getElementById('distil-signup-toast-style')) {
    const style = document.createElement('style');
    style.id = 'distil-signup-toast-style';
    style.textContent = '@keyframes eziToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(style);
  }

  const safeTitle = opts.title.replace(/[<>]/g, '');
  const safeHost = opts.hostname.replace(/[<>]/g, '');
  wrapper.innerHTML = `
    <div style="display:flex;gap:10px;align-items:flex-start">
      <div style="flex-shrink:0;width:28px;height:28px;border-radius:8px;background:rgba(50,145,255,0.18);border:1px solid rgba(50,145,255,0.35);display:flex;align-items:center;justify-content:center;color:#3291ff;font-weight:700;font-size:13px">E</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:#fff;margin-bottom:2px">Signing up at ${safeHost}?</div>
        <div style="color:rgba(255,255,255,0.72);margin-bottom:10px">
          We found the T&amp;C for this signup. Save it to your Distil watchlist and we'll email you if it changes.
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end">
          <button id="distil-toast-dismiss" style="background:transparent;color:rgba(255,255,255,0.6);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 12px;cursor:pointer;font:inherit">Not now</button>
          <button id="distil-toast-save" data-testid="distil-toast-save" style="background:#fff;color:#000;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font:inherit;font-weight:600">Save &amp; watch</button>
        </div>
        <div style="margin-top:8px;font-size:11.5px;color:rgba(255,255,255,0.45);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${opts.url}">${opts.url}</div>
      </div>
      <button id="distil-toast-close" aria-label="Close" style="background:transparent;color:rgba(255,255,255,0.45);border:none;cursor:pointer;font-size:18px;line-height:1;padding:0 2px">×</button>
    </div>`;

  document.body.appendChild(wrapper);
  const close = () => dismissToast();
  wrapper.querySelector('#distil-toast-dismiss')?.addEventListener('click', close);
  wrapper.querySelector('#distil-toast-close')?.addEventListener('click', close);
  wrapper.querySelector('#distil-toast-save')?.addEventListener('click', () => {
    opts.onSave();
    close();
  });
  // auto-dismiss after 25s
  setTimeout(close, 25000);
}

function sendSaveRequest(detail: { url: string; title: string; pageUrl: string }) {
  try {
    const ext: any = typeof chrome !== 'undefined' ? chrome : null;
    if (!ext?.runtime?.sendMessage) return;
    ext.runtime.sendMessage({ action: 'DISTIL_ACCEPT_TERMS', payload: detail }, (_resp: unknown) => {
      // No-op; background handles the API call.
    });
  } catch {
    // context invalidated
  }
}

function onFormSubmitted(ev: SubmitEvent | Event): void {
  const form = (ev.target as HTMLFormElement) || null;
  if (!form || form.tagName !== 'FORM') return;
  try {
    if (!looksLikeSignupForm(form)) return;
    const link = findTcLinkNear(form);
    if (!link) return;
    showToast({
      hostname: window.location.hostname,
      url: link.url,
      title: link.title,
      onSave: () => sendSaveRequest({
        url: link.url,
        title: link.title,
        pageUrl: window.location.href,
      }),
    });
  } catch {
    // swallow — never break the user's signup
  }
}

export function installSignupWatcher(): void {
  if (!isSafeHost()) return;
  if (isDistilHost()) return;
  try {
    // Capture phase so we run even if the site's handler calls stopPropagation later.
    document.addEventListener('submit', onFormSubmitted, true);
  } catch {
    // ignore
  }
}
