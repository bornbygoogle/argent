// Lazy, de-duping loader for the two Google scripts we need. Scripts are only
// injected the first time a Google action is used, so users who never open the
// feature pay zero cost.

const gsiUrl = 'https://accounts.google.com/gsi/client';
const pickerUrl = 'https://apis.google.com/js/picker.js';

const cache = new Map<string, Promise<void>>();

function inject(url: string): Promise<void> {
  const existing = cache.get(url);
  if (existing) return existing;

  const p = new Promise<void>((resolve, reject) => {
    const found = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
    if (found) {
      found.addEventListener('load', () => resolve());
      found.addEventListener('error', () => reject(new Error(`google-script-load-failed:${url}`)));
      return;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`google-script-load-failed:${url}`));
    document.head.appendChild(s);
  });

  cache.set(url, p);
  return p;
}

export function loadGsi(): Promise<void> {
  return inject(gsiUrl);
}

export function loadPicker(): Promise<void> {
  return inject(pickerUrl);
}
