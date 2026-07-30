declare const __APP_VERSION__: string;
declare const __SEARCH_INDEXING_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_GA_MEASUREMENT_ID?: string;
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  readonly VITE_PADDLE_ENV?: "sandbox" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
