type ThemePreference = 'system' | 'light' | 'dark';

export function setupTheme(window: Window & typeof globalThis, document: Document) {
  const select = document.getElementById('theme-preference') as HTMLSelectElement;
  const toggle = document.getElementById('toggle-theme') as HTMLButtonElement;
  let preference: ThemePreference = 'system';
  let media: MediaQueryList | undefined;
  try {
    media = window.matchMedia?.('(prefers-color-scheme: dark)');
  } catch {
    // An unavailable system preference falls back to light.
  }
  try {
    const stored = window.localStorage.getItem('dependency-viewer-theme');
    if (stored === 'system' || stored === 'light' || stored === 'dark') preference = stored;
  } catch {
    // Storage is optional, including on file URLs.
  }
  function apply() {
    select.value = preference;
    document.documentElement.dataset.theme = preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
    const dark = document.documentElement.dataset.theme === 'dark';
    toggle.textContent = dark ? '☀' : '☾';
    toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    toggle.title = toggle.getAttribute('aria-label')!;
    document.dispatchEvent(new window.Event('themechange'));
  }
  function setPreference(next: ThemePreference) {
    preference = next;
    try {
      window.localStorage.setItem('dependency-viewer-theme', preference);
    } catch {
      // The preference remains active for this session.
    }
    apply();
  }
  select.addEventListener('change', () => {
    setPreference(select.value as ThemePreference);
  });
  toggle.addEventListener('click', () => {
    setPreference(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  if (media?.addEventListener) media.addEventListener('change', apply);
  else media?.addListener?.(apply);
  window.addEventListener('pageshow', apply);
  apply();
}
