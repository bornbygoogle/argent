import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const URL = 'https://apis.google.com/js/picker.js';

// The module keeps its cache at module scope, so every test gets a fresh copy.
async function freshLoader() {
  vi.resetModules();
  return import('./loadScripts');
}

describe('loadPicker', () => {
  let appended: HTMLScriptElement[];

  beforeEach(() => {
    document.head.replaceChildren();
    appended = [];
    // happy-dom would really fetch (and run) the Google script as soon as the
    // tag is connected. Record the tag instead; load/error are fired by hand.
    vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      appended.push(node as unknown as HTMLScriptElement);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A transient network failure used to be cached as a permanent rejection,
  // so the Picker stayed unusable until a full page reload.
  it('retries after a failed load instead of replaying the cached rejection', async () => {
    const { loadPicker } = await freshLoader();

    const first = loadPicker();
    expect(appended).toHaveLength(1);
    appended[0].dispatchEvent(new Event('error'));
    await expect(first).rejects.toThrow('google-script-load-failed');

    const second = loadPicker();
    // The retry injected a fresh tag rather than replaying the cached rejection.
    expect(appended).toHaveLength(2);
    appended[1].dispatchEvent(new Event('load'));
    await expect(second).resolves.toBeUndefined();
  });

  // On a second mount the tag exists and has already loaded: no event will
  // ever fire again, so the promise used to hang forever.
  it('resolves at once when an already-loaded script tag exists', async () => {
    // Connecting a real tag would make happy-dom fetch the Google script, so
    // hand the loader a detached tag through the lookup it performs.
    const pre = document.createElement('script');
    pre.setAttribute('src', URL);
    pre.dataset.loaded = '1';
    const lookup = vi.spyOn(document, 'querySelector').mockReturnValue(pre);

    const { loadPicker } = await freshLoader();

    const outcome = await Promise.race([
      loadPicker().then(() => 'resolved'),
      new Promise((r) => setTimeout(() => r('hung'), 200)),
    ]);

    expect(outcome).toBe('resolved');
    expect(lookup).toHaveBeenCalledWith(`script[src="${URL}"]`);
    expect(appended).toHaveLength(0);
  });

  it('shares one in-flight promise across concurrent calls', async () => {
    const { loadPicker } = await freshLoader();

    const a = loadPicker();
    const b = loadPicker();

    expect(b).toBe(a);
    expect(appended).toHaveLength(1);

    appended[0].dispatchEvent(new Event('load'));
    await expect(a).resolves.toBeUndefined();
    await expect(b).resolves.toBeUndefined();
  });
});
