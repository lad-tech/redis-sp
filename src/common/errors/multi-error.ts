import { ReadonlyArrayOf } from '../types/util';

export default class MultiError<T> extends Error {
  constructor(message: string, public readonly errors: ReadonlyArrayOf<T>) {
    super(message);
  }
}

MultiError.prototype.name = 'MultiError';
