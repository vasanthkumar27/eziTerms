(function () {
  if (window.__distilTriggerInjected) return;
  window.__distilTriggerInjected = true;

  const BUTTON_ID = 'distil-sidebar-trigger';
  const STORAGE_KEY = 'distil_sidebar_open';
  const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://localhost:5173'];

  window.addEventListener('message', (ev) => {
    if (ev.data?.type !== 'DISTIL_GOOGLE_SIGNIN_REQUEST' || !ALLOWED_ORIGINS.includes(ev.origin)) return;
    const requestId = ev.data.requestId || 'default';
    chrome.runtime.sendMessage({ action: 'GOOGLE_SIGNIN_REQUEST' }, (res) => {
      const payload = res
        ? { type: 'DISTIL_GOOGLE_SIGNIN_RESPONSE', requestId, token: res.token, error: res.error }
        : { type: 'DISTIL_GOOGLE_SIGNIN_RESPONSE', requestId, error: chrome.runtime?.lastError?.message || 'Extension not responding' };
      window.postMessage(payload, ev.origin);
    });
  });

  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.setAttribute('aria-label', 'Open Distil');
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea, #764ba2);
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      transition: transform 0.2s, box-shadow 0.2s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    });
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'OPEN_SIDE_PANEL' });
    });
    document.body.appendChild(btn);
  }

  createButton();
})();
