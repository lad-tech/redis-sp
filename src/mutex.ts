import { RedisClient } from 'common/types/redis';
import { Mutex } from 'common/types/mutex';
import { ReadonlyArrayOf } from 'common/types/util';

import Lua from './lua';
import { unique } from './util/functional';
import { generateId } from './util/crypto';
import { computeQuorum } from './util/domain';
import { asyncForEach, waitForFirstN } from './util/async';
import { withRetries, PartialWithRetriesOptions, WithRetriesOptions } from './retries';
import ValidationError from './common/errors/validation-error';

interface MutexOptions {
  id?: string;
  expireAfterMillis?: number;
  retryOptions?: PartialWithRetriesOptions;
}

interface LockOptions {
  retryOptions?: PartialWithRetriesOptions;
}

const DEFAULT_RETRY_OPTIONS: WithRetriesOptions = {
  maxRetryAttempts: 10,
  retryDelayMillis: 50,
  jitterMagnitudeMillis: 10,
};

const DEFAULT_EXPIRE_AFTER_MILLIS = 10_000;

export default class RedisMutexImpl implements Mutex {
  constructor(clients: ReadonlyArrayOf<RedisClient>, resourceId: string, options?: MutexOptions) {
    if (!(Array.isArray(clients) && clients.length > 0 && clients.length === unique(...clients).length)) {
      throw new ValidationError('Expected not empty array of unique redis clients');
    }

    this.expireAfterMillis = options?.expireAfterMillis ?? DEFAULT_EXPIRE_AFTER_MILLIS;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...(options?.retryOptions || {}) };
    this.resourceId = resourceId;
    this.clients = [...clients];
    this.id = options?.id ?? generateId();
  }

  public async lock(options?: LockOptions): Promise<void> {
    await withRetries(async () => {
      try {
        await this.tryToAcquireLock();
      } catch {
        await this.tryToReleaseLock();

        throw withRetries.RETRY_SYMBOL;
      }
    }, options?.retryOptions || this.retryOptions)();
  }

  public async tryToLock(): Promise<boolean> {
    try {
      await this.tryToAcquireLock();
    } catch {
      return false;
    }

    return true;
  }

  public async unlock(): Promise<void> {
    await waitForFirstN(
      this.clients,
      async (client) => {
        const result = await Lua.tryToReleaseLock(client, {
          ownerId: this.id,
          resourceId: this.resourceId,
        });

        if (result !== 1) {
          throw new Error('Failed to release lock');
        }
      },
      computeQuorum(this.clients.length),
    );
  }

  private async tryToAcquireLock() {
    await waitForFirstN(
      this.clients,
      async (client) => {
        const result = await Lua.tryToAcquireLock(client, {
          ownerId: this.id,
          resourceId: this.resourceId,
          maxLockTimeMillis: this.expireAfterMillis,
        });

        if (result !== 'OK') {
          throw new Error('Failed to acquire lock');
        }
      },
      computeQuorum(this.clients.length),
    );
  }

  private async tryToReleaseLock() {
    await asyncForEach(
      this.clients,
      async (client) => {
        try {
          await Lua.tryToReleaseLock(client, {
            resourceId: this.resourceId,
            ownerId: this.id,
          });
        } catch {
          // no-op
        }
      },
      this.clients.length,
    );
  }

  private readonly expireAfterMillis: number;
  private readonly retryOptions: WithRetriesOptions;
  private readonly resourceId: string;
  private readonly id: string;

  private readonly clients: ReadonlyArrayOf<RedisClient>;
}
