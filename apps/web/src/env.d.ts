declare const __APP_VERSION__: string;
declare const __SEARCH_INDEXING_ENABLED__: boolean;
declare const __ASSISTANT_VOICE_ENABLED__: boolean;
declare const __ASSISTANT_VOICE_REVIEW_REQUIRED__: boolean;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
