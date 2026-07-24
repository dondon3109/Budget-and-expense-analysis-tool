export type AuthOperationCode = "duplicate_email" | "weak_password" | "rate_limited" | "unknown";

export class AuthOperationError extends Error {
  readonly code: AuthOperationCode;
  readonly providerCode?: string;

  constructor(code: AuthOperationCode, message: string, providerCode?: string) {
    super(message);
    this.name = "AuthOperationError";
    this.code = code;
    this.providerCode = providerCode;
  }
}

function providerCodeFrom(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function providerMessageFrom(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function normalizePasswordError(error: unknown): AuthOperationError {
  const providerCode = providerCodeFrom(error);
  if (providerCode === "weak_password") {
    return new AuthOperationError(
      "weak_password",
      "Choose a stronger password that meets every requirement.",
      providerCode,
    );
  }
  return new AuthOperationError("unknown", "Your password could not be updated.", providerCode);
}

export function normalizeSignupError(error: unknown): AuthOperationError {
  const providerCode = providerCodeFrom(error);
  const providerMessage = providerMessageFrom(error);

  if (
    providerCode === "email_exists" ||
    providerCode === "user_already_exists" ||
    /(?:user|email) already registered/i.test(providerMessage)
  ) {
    return new AuthOperationError(
      "duplicate_email",
      "This email is already registered.",
      providerCode,
    );
  }

  if (providerCode === "weak_password") {
    return new AuthOperationError(
      "weak_password",
      "Choose a stronger password that meets every requirement.",
      providerCode,
    );
  }

  if (providerCode === "over_request_rate_limit" || providerCode === "over_email_send_rate_limit") {
    return new AuthOperationError(
      "rate_limited",
      "Too many signup attempts. Wait a moment and try again.",
      providerCode,
    );
  }

  return new AuthOperationError(
    "unknown",
    "Your account could not be created. Check your details and try again.",
    providerCode,
  );
}
