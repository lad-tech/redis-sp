import { execLuaScript } from '../../src/util/redis';
import { createRedisClientStub } from '../../src/util/tests';

jest.mock('ioredis');

describe('execLuaScript positive test cases', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should successfully execute the Lua script by its hash', async () => {
    const client = createRedisClientStub();

    client.evalsha = jest.fn(async () => 'OK');
    client.eval = jest.fn();

    const result = await execLuaScript(client, `return 'OK'`, '57ade87c8731f041ecac85aba56623f8af391fab');

    expect(result).toBe('OK');

    expect(client.evalsha).toBeCalledTimes(1);
    expect(client.evalsha).toBeCalledWith('57ade87c8731f041ecac85aba56623f8af391fab', 0);

    expect(client.eval).toBeCalledTimes(0);
  });

  it('should successfully execute the Lua script by calling the `eval` method', async () => {
    const client = createRedisClientStub();

    client.evalsha = jest.fn(async () => {
      throw new Error('NOSCRIPT');
    });
    client.eval = jest.fn(async () => 'OK');

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
    const client = createRedisClientStub();
    const unexpectedError = new Error('Oops!');

    client.evalsha = jest.fn(async () => {
      throw unexpectedError;
    });
    client.eval = jest.fn();

    await expect(execLuaScript(client, `return 'OK'`, '57ade87c8731f041ecac85aba56623f8af391fab')).rejects.toThrowError(
      unexpectedError,
    );

    expect(client.evalsha).toBeCalledTimes(1);
    expect(client.evalsha).toBeCalledWith('57ade87c8731f041ecac85aba56623f8af391fab', 0);

    expect(client.eval).toBeCalledTimes(0);
  });
});
