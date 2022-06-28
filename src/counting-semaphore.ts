import { RedisClient } from './common/types/redis';
import { Semaphore } from './common/types/semaphore';
import { ReadonlyArrayOf } from './common/types/util';

import Lua from './lua';
import { unique } from './util/functional';
import { generateId } from './util/crypto';
import { computeQuorum } from './util/domain';
import { getMillisSinceEpoch } from './util/chrono';
import { asyncForEach, waitForFirstN } from './util/async';
import { withRetries, PartialWithRetriesOptions, WithRetriesOptions } from './retries';
import ValidationError from './common/errors/validation-error';

interface CountingSemaphoreOptions {
  id?: string;
  expireAfterMillis?: number;
  retryOptions?: PartialWithRetriesOptions;
}

interface AcquireOptions {
  retryOptions?: PartialWithRetriesOptions;
}

const DEFAULT_RETRY_OPTIONS: WithRetriesOptions = {
  maxRetryAttempts: 10,
  retryDelayMillis: 50,
  jitterMagnitudeMillis: 10,
};

const DEFAULT_EXPIRE_AFTER_MILLIS = 10_000;

export default class RedisCountingSemaphoreImpl implements Semaphore {
  constructor(
    clients: ReadonlyArrayOf<RedisClient>,
    sharedResourceId: string,
    maxSharedResourceOwners: number,
    options?: CountingSemaphoreOptions,
  ) {
    if (!(Array.isArray(clients) && clients.length > 0 && clients.length === unique(...clients).length)) {
      throw new ValidationError('Expected not empty array of unique redis clients');
    }

    this.maxSharedResourceOwners = maxSharedResourceOwners;
    this.expireAfterMillis = options?.expireAfterMillis ?? DEFAULT_EXPIRE_AFTER_MILLIS;
    this.sharedResourceId = sharedResourceId;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...(options?.retryOptions || {}) };
    this.clients = [...clients];
    this.id = options?.id ?? generateId();
  }

  public async acquire(options?: AcquireOptions): Promise<void> {
    await withRetries(async () => {
      try {
        await this.tryToIncrementCounter();
      } catch {
        await this.tryToDecrementCounter();

        throw withRetries.RETRY_SYMBOL;
      }
    }, options?.retryOptions || this.retryOptions)();
  }

  public async tryToAcquire(): Promise<boolean> {
    try {
      await this.tryToIncrementCounter();

      return true;
    } catch {
      return false;
    }
  }

  public async release(): Promise<void> {
    await waitForFirstN(
      this.clients,
      async (client) => {
        const result = await Lua.tryToDecrementCounter(client, {
          sharedResourceId: this.sharedResourceId,
          ownerId: this.id,
        });

        if (result !== 1) {
          throw new Error('Failed to decrement counter');
        }
      },
      computeQuorum(this.clients.length),
    );
  }

  private async tryToIncrementCounter() {
    await waitForFirstN(
      this.clients,
      async (client) => {
        const result = await Lua.tryToIncrementCounter(client, {
          ownerId: this.id,
          sharedResourceId: this.sharedResourceId,
          maxLockTimeMillis: this.expireAfterMillis,
          currentTimeMillis: getMillisSinceEpoch(),
          maxSharedResourceOwners: this.maxSharedResourceOwners,
        });

        if (result !== 1) {
          throw new Error('Failed to increment counter');
        }
      },
      computeQuorum(this.clients.length),
    );
  }

  private async tryToDecrementCounter() {
    await asyncForEach(
      this.clients,
      async (client) => {
        try {
          await Lua.tryToDecrementCounter(client, {
            sharedResourceId: this.sharedResourceId,
            ownerId: this.id,
          });
        } catch {
          // no-op
        }
      },
      this.clients.length,
    );
  }

  private readonly maxSharedResourceOwners: number;
  private readonly expireAfterMillis: number;
  private readonly sharedResourceId: string;
  private readonly retryOptions: WithRetriesOptions;
  private readonly id: string;

  private readonly clients: ReadonlyArrayOf<RedisClient>;
}
