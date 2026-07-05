// Lazy, de-duping loader for the two Google scripts we need. Scripts are only
// injected the first time a Google action is used, so users who never open the
// feature pay zero cost.

const gsiUrl = 'https://accounts.google.com/gsi/client';
const pickerUrl = 'https://apis.google.com/js/picker.js';

const cache = new Map<string, Promise<void>>();

function inject(url: string): Promise<void> {
  const existing = cache.get(url);
  if (existing) return existing;

  let resolveFn: () => void;
  let rejectFn: (e: Error) => void;

  const p = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  cache.set(url, p);

  const found = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);

  if (found) {
    found.addEventListener('load', () => resolveFn());
    found.addEventListener('error', () => rejectFn(new Error(`google-script-load-failed:${url}`)));
    return p;
  }

  const s = document.createElement('script');
  s.src = url;
  s.async = true;
  s.defer = true;

  s.onload = () => resolveFn();
  s.onerror = () => rejectFn(new Error(`google-script-load-failed:${url}`));

  document.head.appendChild(s);

  return p;
}

export function loadGsi(): Promise<void> {
  return inject(gsiUrl);
}

export function loadPicker(): Promise<void> {
  return inject(pickerUrl);
}
