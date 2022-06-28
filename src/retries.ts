import { ArrayOf } from './common/types/util';

import MaxRetryAttemptsError from './common/errors/max-retry-attempts-error';
import { uniformRandom } from './util/random';
import { sleep } from './util/async';

export interface WithRetriesOptions {
  maxRetryAttempts: number;
  retryDelayMillis: number;
  jitterMagnitudeMillis: number;
}

export type PartialWithRetriesOptions = Partial<WithRetriesOptions>;

const DEFAULT_MAX_RETRY_ATTEMPTS = 10;
const DEFAULT_RETRY_DELAY_MILLIS = 200;
const DEFAULT_JITTER_MAGNITUDE_MILLIS = 20;

const RETRY_SYMBOL = Symbol('Throw me to retry');

function computeJitter(magnitude: number) {
  return Math.round(uniformRandom(-magnitude, magnitude));
}

export function withRetries<T extends ArrayOf<unknown>, U>(
  fn: (...args: T) => Promise<U>,
  options?: PartialWithRetriesOptions,
) {
  return async function <C>(this: C, ...forwardArgs: T) {
    const maxRetryAttempts = options?.maxRetryAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;
    const retryDelayMillis = options?.retryDelayMillis ?? DEFAULT_RETRY_DELAY_MILLIS;
    const jitterMagnitudeMillis = options?.jitterMagnitudeMillis ?? DEFAULT_JITTER_MAGNITUDE_MILLIS;

    let attemptsLeft = 1 + maxRetryAttempts;

    while (attemptsLeft > 0) {
      try {
        return await fn.apply(this, forwardArgs);
      } catch (err) {
        if (err !== RETRY_SYMBOL) {
          // unexpected error
          throw err;
        }
      }

      const delayMillis = retryDelayMillis + computeJitter(jitterMagnitudeMillis);

      if (delayMillis > 0) {
        await sleep(delayMillis);
      }

      --attemptsLeft;
    }

    throw new MaxRetryAttemptsError('Failed', maxRetryAttempts);
  };
}

withRetries.RETRY_SYMBOL = RETRY_SYMBOL;
