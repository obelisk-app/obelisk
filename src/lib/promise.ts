/**
 * Race `promise` against a timeout. Rejects with `new Error(message)` after
 * `ms` milliseconds if `promise` hasn't settled.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'timeout'): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
