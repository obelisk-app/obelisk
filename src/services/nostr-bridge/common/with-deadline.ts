/**
 * Race a promise against a timeout; the timer is always cleared so a settled
 * promise leaves nothing pending. A timeout rejects with a `CodedError`
 * (`code`, default `signer-timeout`) whose message is `message`.
 */
import { CodedError, type ErrorCode } from '@/utils/errors/codes';

export async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  code: ErrorCode = 'signer-timeout',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CodedError(code, message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
