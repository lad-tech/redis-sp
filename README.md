# redis-sp

Redis SP (SP stands for Synchronization Primitives) is a set of synchronization primitives based on
the [Redlock](https://redis.io/docs/reference/patterns/distributed-locks/) algorithm.

## Installation

```
npm install redis-sp
```

## Usage

### Mutex

Mutex implementation based on the [Redlock](https://redis.io/docs/reference/patterns/distributed-locks/) algorithm

```typescript
import RedisClient from 'ioredis';
import { RedisMutex } from 'redis-sp';

async function main() {
  const client = new RedisClient();

  const mutex = new RedisMutex([client], getResourceIdSomehow());
  await mutex.lock();

  try {
    // critical section of your code
    await maybeFails();
  } finally {
    await mutex.unlock();
  }
}
```

### Counting Semaphore

Implementation of a counting semaphore according to
the [Fair semaphores | Redis](https://redis.com/ebook/part-2-core-concepts/chapter-6-application-components-in-redis/6-3-counting-semaphores/6-3-2-fair-semaphores/)
with a slight difference (no race conditions due to the atomicity of Redis Lua scripts).

```typescript
import RedisClient from 'ioredis';
import { RedisCountingSemaphore } from 'redis-sp';

async function main() {
  const client = new RedisClient();

  const semaphore = new RedisCountingSemaphore(
    [client],
    getSharedResourceIdSomehow(),
    getMaxSharedResourceOwnersSomehow(),
  );
  await semaphore.acquire();

  try {
    // critical section of your code
    await maybeFails();
  } finally {
    await semaphore.release();
  }
}
```

Stay tuned for RW lock in the next major release!
