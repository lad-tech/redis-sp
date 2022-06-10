import { RedisClient } from '../../src/common/types/redis';

import { execLuaScript } from '../../src/util/redis';
import { asMockedFunction } from '../../src/util/tests';

jest.mock('ioredis');

describe('execLuaScript positive test cases', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should successfully execute the Lua script by its hash', async () => {
    const client = new RedisClient();

    asMockedFunction(client.evalsha).mockResolvedValueOnce('OK');

    const result = await execLuaScript(client, `return 'OK'`, '57ade87c8731f041ecac85aba56623f8af391fab');

    expect(result).toBe('OK');

    expect(client.evalsha).toBeCalledTimes(1);
    expect(client.evalsha).toBeCalledWith('57ade87c8731f041ecac85aba56623f8af391fab', 0);

    expect(client.eval).toBeCalledTimes(0);
  });

  it('should successfully execute the Lua script by calling the `eval` method', async () => {
    const client = new RedisClient();

    asMockedFunction(client.evalsha).mockRejectedValueOnce(new Error('NOSCRIPT'));
    asMockedFunction(client.eval).mockResolvedValueOnce('OK');

    const result = await execLuaScript(client, `return 'OK'`, '57ade87c8731f041ecac85aba56623f8af391fab');

    expect(result).toBe('OK');

    expect(client.evalsha).toBeCalledTimes(1);
    expect(client.evalsha).toBeCalledWith('57ade87c8731f041ecac85aba56623f8af391fab', 0);

    expect(client.eval).toBeCalledTimes(1);
    expect(client.eval).toBeCalledWith(`return 'OK'`, 0);
  });
});

describe('execLuaScript negative test cases', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should throw an exception if an unexpected error occurred', async () => {
    const client = new RedisClient();
    const unexpectedError = new Error('Oops!');

    asMockedFunction(client.evalsha).mockRejectedValueOnce(unexpectedError);

    await expect(execLuaScript(client, `return 'OK'`, '57ade87c8731f041ecac85aba56623f8af391fab')).rejects.toThrowError(
      unexpectedError,
    );

    expect(client.evalsha).toBeCalledTimes(1);
    expect(client.evalsha).toBeCalledWith('57ade87c8731f041ecac85aba56623f8af391fab', 0);

    expect(client.eval).toBeCalledTimes(0);
  });
});
