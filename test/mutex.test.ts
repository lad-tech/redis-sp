import Lua from '../src/lua';
import RedisMutex from '../src/mutex';
import MaxRetryAttemptsError from '../src/common/errors/max-retry-attempts-error';
import { asMockedFunction, createRedisClientStub } from '../src/util/tests';
import { arrayOf } from '../src/util/functional';

jest.mock('../src/lua');

describe('mutex positive test cases. correct usage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should successfully acquire the lock on all clients', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = { expireAfterMillis: 5_000, id: '7d655b0a-08fb-4664-974d-e2e2e99cf06a' };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToAcquireLock).mockResolvedValue('OK');

    const mutex = new RedisMutex(clients, resourceId, options);

    await mutex.lock();

    expect(Lua.tryToAcquireLock).toBeCalledTimes(clients.length);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(0);

    clients.forEach((client, i) => {
      expect(Lua.tryToAcquireLock).toHaveBeenNthCalledWith(i + 1, client, {
        resourceId,
        ownerId: options.id,
        maxLockTimeMillis: options.expireAfterMillis,
      });
    });
  });

  it('should successfully release the lock on all clients', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = { id: '7d655b0a-08fb-4664-974d-e2e2e99cf06a' };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToAcquireLock).mockResolvedValue('OK');
    asMockedFunction(Lua.tryToReleaseLock).mockResolvedValue(1);

    const mutex = new RedisMutex(clients, resourceId, options);

    await mutex.lock();
    await mutex.unlock();

    expect(Lua.tryToAcquireLock).toBeCalledTimes(clients.length);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(clients.length);

    clients.forEach((client, i) => {
      expect(Lua.tryToReleaseLock).toHaveBeenNthCalledWith(i + 1, client, {
        resourceId,
        ownerId: options.id,
      });
    });
  });

  it('should successfully acquire the lock on all clients by calling `tryToLock` method', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = { expireAfterMillis: 5_000, id: '7d655b0a-08fb-4664-974d-e2e2e99cf06a' };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToAcquireLock).mockResolvedValue('OK');

    const mutex = new RedisMutex(clients, resourceId, options);

    const result = await mutex.tryToLock();

    expect(result).toBe(true);

    expect(Lua.tryToAcquireLock).toBeCalledTimes(clients.length);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(0);

    clients.forEach((client, i) => {
      expect(Lua.tryToAcquireLock).toHaveBeenNthCalledWith(i + 1, client, {
        resourceId,
        ownerId: options.id,
        maxLockTimeMillis: options.expireAfterMillis,
      });
    });
  });

  it('should try to acquire the lock again if the first attempt was unsuccessful', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = {
      retryOptions: { maxRetryAttempts: 1, retryDelayMillis: 0, jitterMagnitudeMillis: 0 },
    };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToAcquireLock)
      // default
      .mockResolvedValue('OK')
      // first attempt
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('OK');

    const mutex = new RedisMutex(clients, resourceId, options);

    await mutex.lock();

    expect(Lua.tryToAcquireLock).toBeCalledTimes(clients.length * 2);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(clients.length);
  });
});

describe('mutex negative test cases. incorrect usage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should throw an exception on failed quorum', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = {
      retryOptions: { maxRetryAttempts: 0 },
    };

    const clients = arrayOf(createRedisClientStub, 2);

    const mutex = new RedisMutex(clients, resourceId, options);

    await expect(mutex.lock()).rejects.toThrowError(new MaxRetryAttemptsError('Failed', 0));

    expect(Lua.tryToAcquireLock).toBeCalledTimes(clients.length);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(clients.length);
  });
});

describe('mutex negative test cases. concurrency', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should throw an exception if the lock could not be acquired after all retries', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = {
      retryOptions: { maxRetryAttempts: 10, retryDelayMillis: 0, jitterMagnitudeMillis: 0 },
    };

    const clients = arrayOf(createRedisClientStub, 3);

    const totalRetryAttempts = (options.retryOptions.maxRetryAttempts + 1) * clients.length;

    asMockedFunction(Lua.tryToAcquireLock).mockResolvedValue(null);

    const mutex = new RedisMutex(clients, resourceId, options);

    await expect(mutex.lock()).rejects.toThrowError(
      new MaxRetryAttemptsError('Failed', options.retryOptions.maxRetryAttempts),
    );

    expect(Lua.tryToAcquireLock).toBeCalledTimes(totalRetryAttempts);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(totalRetryAttempts);
  });

  it('should throw an exception if it failed to release the lock', async () => {
    const resourceId = '3dd6472f-4e4b-4559-b781-cc5d75c4f6f2';
    const options = {
      id: '7d655b0a-08fb-4664-974d-e2e2e99cf06a',
    };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToAcquireLock).mockResolvedValue('OK');
    asMockedFunction(Lua.tryToReleaseLock).mockResolvedValue(0);

    const mutex = new RedisMutex(clients, resourceId, options);

    await mutex.lock();

    await expect(mutex.unlock()).rejects.toThrowError('Failed due to multiple errors');

    expect(Lua.tryToReleaseLock).toBeCalledTimes(clients.length);
    expect(Lua.tryToReleaseLock).toBeCalledTimes(clients.length);
  });
});
