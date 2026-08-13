import type { ReactElement } from "react";

import type { SocialAuthProvider } from "../../auth/AuthProvider";

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}

const PROVIDERS: Array<{
  id: SocialAuthProvider;
  label: string;
  mark: () => ReactElement;
}> = [{ id: "google", label: "Continue with Google", mark: GoogleMark }];

export function SocialAuthButtons({
  busyProvider,
  disabled,
  onSelect,
}: {
  busyProvider: SocialAuthProvider | null;
  disabled: boolean;
  onSelect: (provider: SocialAuthProvider) => void;
}) {
  return (
    <div className="auth-provider-section">
      <div className="auth-provider-buttons" aria-label="Social sign-in options">
        {PROVIDERS.map(({ id, label, mark: Mark }) => (
          <button
            key={id}
            className="button auth-provider-button"
            type="button"
            disabled={disabled}
            aria-busy={busyProvider === id}
            onClick={() => onSelect(id)}
          >
            <span className="auth-provider-mark">
              <Mark />
            </span>
            <span>{busyProvider === id ? "Connecting to Google…" : label}</span>
          </button>
        ))}
      </div>
      <p className="auth-provider-note">
        Using the same verified email keeps your existing Zoption workspace.
      </p>
      <div className="auth-divider" aria-hidden="true">
        <span>or continue with email</span>
      </div>
    </div>
  );
}
