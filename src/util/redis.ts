import { RedisClient } from '../common/types/redis';
import { ReadonlyArrayOf } from '../common/types/util';

function isMatchingScriptNotFoundError(err: Error) {
  return err.toString().includes('NOSCRIPT');
}

export async function execLuaScript<R>(
  client: RedisClient,
  script: string,
  hash: string,
  scriptKeys?: ReadonlyArrayOf<string>,
  scriptArgs?: ReadonlyArrayOf<string | number>,
) {
  const numKeys = scriptKeys?.length ?? 0;
  const scriptInput = [...(scriptKeys || []), ...(scriptArgs || [])];

  try {
    // Try to execute the cached version of the script first
    return await (client.evalsha(hash, numKeys, ...scriptInput) as Promise<R>);
  } catch (err) {
    if (!isMatchingScriptNotFoundError(err)) {
      throw err;
    }

    return client.eval(script, numKeys, ...scriptInput) as Promise<R>;
  }
}
