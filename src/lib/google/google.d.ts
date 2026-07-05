// Minimal ambient typings for the Google Identity Services + Picker SDKs
// (loaded at runtime via loadScripts.ts). Only the members we touch are typed.

declare global {
  interface Window {
    google?: GoogleGlobal;
  }

  interface GoogleGlobal {
    accounts: {
      oauth2: {
        initTokenClient: (config: TokenClientConfig) => TokenClient;
        revoke: (token: string, done?: () => void) => void;
      };
    };
    picker?: {
      PickerBuilder: new () => PickerBuilder;
      ViewId: { FOLDERS: string; DOCS: string };
      Response: { ACTION: 'action'; DOCUMENTS: 'docs' };
      Action: { PICKED: 'picked'; CANCEL: 'cancel' };
      DocsView: new (viewId?: string) => DocsView;
      DocsViewMode: { GRID: 'grid'; LIST: 'list' };
    };
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    callback: (resp: TokenResponse) => void;
    error_callback?: (resp: { error: string }) => void;
  }

  interface TokenResponse {
    access_token?: string;
    expires_in?: string;
    error?: string;
    error_description?: string;
  }

  interface TokenClient {
    requestAccessToken: (override?: { prompt?: string }) => void;
  }

  interface PickerDocument {
    id: string;
    name: string;
  }

  interface PickerResponseData {
    [key: string]: unknown;
    action?: string;
    docs?: PickerDocument[];
  }

  interface PickerBuilder {
    setOAuthToken: (token: string) => PickerBuilder;
    setDeveloperKey: (key: string) => PickerBuilder;
    addView: (view: unknown) => PickerBuilder;
    setCallback: (cb: (data: PickerResponseData) => void) => PickerBuilder;
    setTitle: (title: string) => PickerBuilder;
    build: () => { setVisible: (v: boolean) => void };
  }

  interface DocsView {
    setIncludeFolders: (v: boolean) => DocsView;
    setSelectFolderEnabled: (v: boolean) => DocsView;
    setMimeTypes: (m: string) => DocsView;
    setMode: (m: string) => DocsView;
  }
}

export {};
