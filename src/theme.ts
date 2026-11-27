type ThemePreference = 'system' | 'light' | 'dark';

export function setupTheme(window: Window & typeof globalThis, document: Document) {
  const select = document.getElementById('theme-preference') as HTMLSelectElement;
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
    document.dispatchEvent(new window.Event('themechange'));
  }
  select.addEventListener('change', () => {
    preference = select.value as ThemePreference;
    try {
      window.localStorage.setItem('dependency-viewer-theme', preference);
    } catch {
      // The preference remains active for this session.
    }
    apply();
  });
  if (media?.addEventListener) media.addEventListener('change', apply);
  else media?.addListener?.(apply);
  window.addEventListener('pageshow', apply);
  apply();
}
