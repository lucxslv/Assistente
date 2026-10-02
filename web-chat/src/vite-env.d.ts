/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CHARLIE_API_URL?: string;
  readonly VITE_CHARLIE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
