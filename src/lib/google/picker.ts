// Google Drive Picker wrappers. Returns the picked folder/file, or null if the
// user cancels.

import { GOOGLE_API_KEY } from './env';
import { loadPicker } from './loadScripts';

export interface Picked {
  id: string;
  name: string;
}

// The Picker script's `onload` fires before `window.google.picker` is actually
// attached — the SDK bootstraps in a follow-up tick/iframe. On desktop this is
// imperceptible; on mobile the delay can cross a frame boundary and `g?.picker`
// is still undefined right after loadPicker() resolves, producing
// `google-picker-unavailable` on the first back up / restore. Poll briefly for
// it to appear instead of failing instantly.
async function waitForPicker(timeoutMs = 4000): Promise<NonNullable<Window['google']>> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const g = window.google;
    if (g?.picker) return g;
    await new Promise((r) => setTimeout(r, 50));
  }
  const g = window.google;
  if (g?.picker) return g;
  throw new Error('google-picker-unavailable');
}

async function show(
  token: string,
  title: string,
  configure: (builder: PickerBuilder, g: NonNullable<Window['google']>) => void,
): Promise<Picked | null> {
  await loadPicker();
  const g = await waitForPicker();

  return new Promise<Picked | null>((resolve) => {
    const origin = window.location.origin;
    const builder = new g.picker!.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOrigin(origin)
      .setTitle(title)
      .setCallback((data: PickerResponseData) => {
        const action = data[g.picker!.Response.ACTION];
        if (action === g.picker!.Action.PICKED) {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name } : null);
        } else if (action === g.picker!.Action.CANCEL) {
          resolve(null);
        }
      });
    configure(builder, g);
    builder.build().setVisible(true);
  });
}

/** Let the user pick a Drive folder (to save the backup into). */
export function pickFolder(token: string, title: string): Promise<Picked | null> {
  return show(token, title, (builder, g) => {
    const view = new g.picker!.DocsView(g.picker!.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMode(g.picker!.DocsViewMode.GRID);
    builder.addView(view);
  });
}

/** Let the user pick a Drive file (a previously-saved backup to restore). */
export function pickFile(token: string, title: string): Promise<Picked | null> {
  return show(token, title, (builder, g) => {
    const view = new g.picker!.DocsView().setIncludeFolders(true).setMimeTypes('application/json');
    builder.addView(view);
  });
}
