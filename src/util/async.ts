import { ArrayOf, ReadonlyArrayOf } from 'common/types/util';

import MultiError from '../common/errors/multi-error';

async function concurrently(n: number, fn: () => Promise<void>) {
  const promises: ArrayOf<Promise<void>> = [];

  for (let i = 0; i < n; ++i) {
    promises.push(fn());
  }

  await Promise.all(promises);
}

export async function asyncForEach<T>(
  input: ReadonlyArrayOf<T>,
  fn: (item: T, index: number, array: ReadonlyArrayOf<T>) => Promise<void>,
  concurrency = 1,
) {
  let done = 0;

  await concurrently(Math.min(concurrency, input.length), async () => {
    while (done < input.length) {
      const index = done++;

      await fn(input[index], index, input);
    }
  });
}

export async function waitForFirstN<T, U>(
  input: ReadonlyArrayOf<T>,
  fn: (item: T, index: number, array: ReadonlyArrayOf<T>) => Promise<U>,
  n: number,
) {
  if (!(n > 0)) {
    return [];
  }

  return new Promise<ArrayOf<U>>((resolve, reject) => {
    const promises: ArrayOf<Promise<void>> = [];

    const firstN = Math.min(input.length, n);
    const rejectThreshold = input.length - firstN + 1;

    const results: ArrayOf<U> = [];
    const errors: ArrayOf<unknown> = [];

    const wrappedFn = async (...forwardArgs: Parameters<typeof fn>) => {
      try {
        const result = await fn(...forwardArgs);

        results.push(result);

        if (results.length === firstN) {
          resolve([...results]);
        }
      } catch (err) {
        errors.push(err);

        if (errors.length === rejectThreshold) {
          reject(new MultiError(`Failed due to ${errors.length !== 1 ? 'multiple errors' : 'error'}`, [...errors]));
        }
      }
    };

    input.forEach((item, index, array) => {
      promises.push(wrappedFn(item, index, array));
    });
  });
}

export async function sleep(millis: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, millis);
  });
}
