/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NKG_NOTION_WORKSPACE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
