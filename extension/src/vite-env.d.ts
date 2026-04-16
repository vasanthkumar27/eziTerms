/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_AWS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
