/**
 * Extension icon popup - toggle on/off and open side panel.
 */
(function () {
  const STORAGE_KEY = 'eziterms_extension_enabled';
  const LOGO_DARK = 'assets/eziterms-Logo-icon-dark-theme.png';
  const LOGO_LIGHT = 'assets/eziterms-Logo-icon-light-theme.png';

  function setLogoByTheme() {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = mq ? mq.matches : true;
    const img = document.getElementById('logo-img');
    if (img) img.src = isDark ? LOGO_DARK : LOGO_LIGHT;
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'EZITERMS_SET_THEME_ICON', isDark }).catch(() => {});
    }
  }
  setLogoByTheme();
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setLogoByTheme);
  }
  const DEFAULT = true;

  async function getEnabled() {
    const r = await chrome.storage.local.get([STORAGE_KEY]);
    return r[STORAGE_KEY] === false || r[STORAGE_KEY] === true ? r[STORAGE_KEY] : DEFAULT;
  }

  async function setEnabled(v) {
    await chrome.storage.local.set({ [STORAGE_KEY]: v });
  }

  const toggle = document.getElementById('toggle');
  const openBtn = document.getElementById('open-btn');
  const statusText = document.getElementById('status-text');

  function updateStatusText(isOn) {
    if (statusText) statusText.textContent = isOn ? 'On' : 'Off';
  }

  function handleToggle() {
    const next = !toggle.classList.contains('on');
    toggle.classList.toggle('on', next);
    updateStatusText(next);
    setEnabled(next);
  }
  toggle.addEventListener('click', handleToggle);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  });

  openBtn.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (e) {
      console.error(e);
    }
    window.close();
  });

  getEnabled().then((v) => {
    toggle.classList.toggle('on', v);
    updateStatusText(v);
  });
})();
