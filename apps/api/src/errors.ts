export class HttpError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 410 | 413 | 422 | 429 | 500 | 502 | 503 | 504,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
