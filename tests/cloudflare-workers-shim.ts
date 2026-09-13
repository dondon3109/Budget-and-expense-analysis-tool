/** Vitest stand-in for the Workers runtime module. Wrangler supplies the real class. */
export class DurableObject {
  readonly ctx: DurableObjectState;
  readonly env: unknown;

  constructor(ctx: DurableObjectState, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }
}
