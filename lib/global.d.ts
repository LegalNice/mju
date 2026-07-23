// Global type declarations that outlive any single component.

interface Window {
  /** Injected by the desktop shell (Electron/Tauri) when available. */
  piDesktop?: {
    selectDirectory: () => Promise<string | null>;
  };
}
