/// <reference types="astro/client" />

declare const __APP_VERSION__: string;
declare const __SEARCH_INDEXING_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
  readonly PUBLIC_APP_URL?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
