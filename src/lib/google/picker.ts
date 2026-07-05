// Google Drive Picker wrappers. Returns the picked folder/file, or null if the
// user cancels.

import { GOOGLE_API_KEY } from './env';
import { loadPicker } from './loadScripts';

export interface Picked {
  id: string;
  name: string;
}

async function show(
  token: string,
  title: string,
  configure: (builder: PickerBuilder, g: NonNullable<Window['google']>) => void,
): Promise<Picked | null> {
  await loadPicker();
  const g = window.google;
  if (!g?.picker) throw new Error('google-picker-unavailable');

  return new Promise<Picked | null>((resolve) => {
    const origin = window.location.origin;
    const builder = new g.picker!.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setOrigin(origin)
      .setTitle(title)
      .setCallback((data: PickerResponseData) => {
        console.log('[PICKER CALLBACK] Données reçues :', data); // AJOUTE ÇA
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
