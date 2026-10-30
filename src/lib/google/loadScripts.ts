// Lazy, de-duping loader for the two Google scripts we need. Scripts are only
// injected the first time a Google action is used, so users who never open the
// feature pay zero cost.

// Only the Picker script is needed now. Authentication moved to the server-side
// authorization-code flow (api/auth/*), so the Google Identity Services script
// is no longer loaded at all.
const pickerUrl = 'https://apis.google.com/js/picker.js';

const cache = new Map<string, Promise<void>>();

function inject(url: string): Promise<void> {
  const existing = cache.get(url);
  if (existing) return existing;

  // `!`: the Promise executor below runs synchronously, so both are assigned
  // before the already-loaded path calls resolveFn() on the same tick.
  let resolveFn!: () => void;
  let rejectFn!: (e: Error) => void;

  const p = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  cache.set(url, p);

  // A failure must not stay cached, or one flaky moment disables the feature
  // until a page reload. The tag is removed too, so a retry injects a fresh one.
  const fail = (tag: HTMLScriptElement) => {
    if (cache.get(url) === p) cache.delete(url);
    tag.remove();
    rejectFn(new Error(`google-script-load-failed:${url}`));
  };
  const succeed = (tag: HTMLScriptElement) => {
    tag.dataset.loaded = '1';
    resolveFn();
  };

  const found = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);

  if (found) {
    // Already finished loading: no further event will fire, so don't wait for one.
    if (found.dataset.loaded) {
      resolveFn();
      return p;
    }
    found.addEventListener('load', () => succeed(found));
    found.addEventListener('error', () => fail(found));
    return p;
  }

  const s = document.createElement('script');
  s.src = url;
  s.async = true;
  s.defer = true;

  s.onload = () => succeed(s);
  s.onerror = () => fail(s);

  document.head.appendChild(s);

  return p;
}

export function loadPicker(): Promise<void> {
  return inject(pickerUrl);
}
