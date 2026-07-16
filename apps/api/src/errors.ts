export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 410 | 413 | 500,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
