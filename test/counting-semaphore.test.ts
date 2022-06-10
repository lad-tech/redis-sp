import Lua from '../src/lua';
import CountingSemaphore from '../src/counting-semaphore';
import MaxRetryAttemptsError from '../src/common/errors/max-retry-attempts-error';
import { asMockedFunction, createRedisClientStub } from '../src/util/tests';
import { getMillisSinceEpoch } from '../src/util/chrono';
import { arrayOf } from '../src/util/functional';

jest.mock('../src/lua');
jest.mock('../src/util/chrono');

describe('counting semaphore positive test cases. correct usage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should successfully decrement the counter on all clients', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;
    const options = { expireAfterMillis: 5_000, id: 'f6084a8c-c639-40f3-9a84-c0846f7d2356' };
    const currentTimeMillis = Date.now();

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter).mockResolvedValue(1);
    asMockedFunction(getMillisSinceEpoch).mockReturnValue(currentTimeMillis);

    const semaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, options);

    await semaphore.acquire();

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(0);

    clients.forEach((client, i) => {
      expect(Lua.tryToIncrementCounter).toHaveBeenNthCalledWith(i + 1, client, {
        ownerId: options.id,
        sharedResourceId,
        currentTimeMillis,
        maxLockTimeMillis: options.expireAfterMillis,
        maxSharedResourceOwners,
      });
    });
  });

  it('should successfully increment the counter on all clients', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;
    const options = { expireAfterMillis: 5_000, id: 'f6084a8c-c639-40f3-9a84-c0846f7d2356' };
    const currentTimeMillis = Date.now();

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter).mockResolvedValue(1);
    asMockedFunction(Lua.tryToDecrementCounter).mockResolvedValue(1);
    asMockedFunction(getMillisSinceEpoch).mockReturnValue(currentTimeMillis);

    const semaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, options);

    await semaphore.acquire();
    await semaphore.release();

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(clients.length);

    clients.forEach((client, i) => {
      expect(Lua.tryToDecrementCounter).toHaveBeenNthCalledWith(i + 1, client, {
        ownerId: options.id,
        sharedResourceId,
      });
    });
  });

  it('should successfully increment the counter on all clients by calling `tryToAcquire` method', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;
    const options = { expireAfterMillis: 5_000, id: 'f6084a8c-c639-40f3-9a84-c0846f7d2356' };
    const currentTimeMillis = Date.now();

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter).mockResolvedValue(1);
    asMockedFunction(getMillisSinceEpoch).mockReturnValue(currentTimeMillis);

    const semaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, options);

    await semaphore.tryToAcquire();

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(0);

    clients.forEach((client, i) => {
      expect(Lua.tryToIncrementCounter).toHaveBeenNthCalledWith(i + 1, client, {
        ownerId: options.id,
        sharedResourceId,
        currentTimeMillis,
        maxLockTimeMillis: options.expireAfterMillis,
        maxSharedResourceOwners,
      });
    });
  });
});

describe('counting semaphore positive test cases. concurrency', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should successfully decrement the counter twice', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 2;

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter).mockResolvedValue(1);

    const firstSemaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, {
      id: 'f6084a8c-c639-40f3-9a84-c0846f7d2356',
    });
    const secondSemaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, {
      id: 'bcc157f2-59ef-4480-896e-ab51d192bc90',
    });

    await Promise.all([firstSemaphore.acquire(), secondSemaphore.acquire()]);

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length * 2);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(0);
  });

  it('should decrement the counter only once', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter)
      // default
      .mockResolvedValue(0)
      // first attempt
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1);

    const firstSemaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, {
      id: 'f6084a8c-c639-40f3-9a84-c0846f7d2356',
    });
    const secondSemaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, {
      retryOptions: { maxRetryAttempts: 0 },
      id: 'bcc157f2-59ef-4480-896e-ab51d192bc90',
    });

    await firstSemaphore.acquire();

    await expect(secondSemaphore.acquire()).rejects.toThrowError(new MaxRetryAttemptsError('Failed', 0));

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length * 2);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(clients.length);
  });

  it('should try to decrement the counter again if the first attempt was unsuccessful', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;
    const options = {
      retryOptions: { maxRetryAttempts: 1, retryDelayMillis: 0, jitterMagnitudeMillis: 0 },
    };

    const clients = arrayOf(createRedisClientStub, 3);

    asMockedFunction(Lua.tryToIncrementCounter)
      // default
      .mockResolvedValue(1)
      // first attempt
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const semaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, options);

    await semaphore.acquire();

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length * 2);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(clients.length);
  });
});

describe('counting semaphore negative test cases. incorrect usage', () => {
  it('should throw an exception on failed quorum', async () => {
    const sharedResourceId = 'a3b41e75-b7c9-4618-8847-c7aef4f8cc13';
    const maxSharedResourceOwners = 1;
    const options = {
      retryOptions: { maxRetryAttempts: 0 },
    };

    const clients = arrayOf(createRedisClientStub, 2);

    const semaphore = new CountingSemaphore(clients, sharedResourceId, maxSharedResourceOwners, options);

    await expect(semaphore.acquire()).rejects.toThrowError(new MaxRetryAttemptsError('Failed', 0));

    expect(Lua.tryToIncrementCounter).toBeCalledTimes(clients.length);
    expect(Lua.tryToDecrementCounter).toBeCalledTimes(clients.length);
  });
});
