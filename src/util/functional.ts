import { ArrayOf, ReadonlyArrayOf } from '../common/types/util';

export function unique<T>(...args: ReadonlyArrayOf<T>) {
  return Array.from(new Set(args));
}

export function arrayOf<T>(valueFn: () => T, length: number): ReadonlyArrayOf<T> {
  const ret: ArrayOf<T> = [];

  for (let i = 0; i < length; ++i) {
    ret.push(valueFn());
  }

  return ret;
}
