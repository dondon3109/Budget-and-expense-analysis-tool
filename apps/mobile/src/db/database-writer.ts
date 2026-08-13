/**
 * Keeps every financial write on one keyed SQLite connection ordered. Expo's
 * transaction helper cannot safely nest, so pull application, local mutations,
 * and push result handling share this coordinator.
 */
export class LocalDatabaseWriter {
  private operation = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.operation.then(task, task);
    this.operation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
