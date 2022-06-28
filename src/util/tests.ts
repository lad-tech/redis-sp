import { RedisClient } from '../common/types/redis';
import { ArrayOf } from '../common/types/util';

export function asMockedFunction<T extends (...args: ArrayOf<any>) => any>(fn: T) {
  return fn as jest.MockedFunction<T>;
}

export function createRedisClientStub() {
  return {} as RedisClient;
}
