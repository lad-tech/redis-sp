import fs from 'fs';
import path from 'path';

import { RedisClient } from '../common/types/redis';
import { Maybe, ArrayOf, ReadonlyArrayOf } from '../common/types/util';

import ValidationError from '../common/errors/validation-error';
import { isNumber, isString } from '../util/predicates';
import { createSHA1Hash } from '../util/crypto';
import { execLuaScript } from '../util/redis';

function loadLuaScriptSync(filename: string) {
  return fs.readFileSync(path.resolve(__dirname, 'scripts', `${filename}.lua`), { encoding: 'utf8' });
}

const LUA_SOURCE_CODE = {
  TRY_TO_ACQUIRE_LOCK: loadLuaScriptSync('try-to-acquire-lock'),
  TRY_TO_RELEASE_LOCK: loadLuaScriptSync('try-to-release-lock'),
  TRY_TO_INCREMENT_COUNTER: loadLuaScriptSync('try-to-increment-counter'),
  TRY_TO_DECREMENT_COUNTER: loadLuaScriptSync('try-to-decrement-counter'),
} as const;

type ScriptKey<N extends string, T extends StringConstructor> = Readonly<{
  name: N;
  type: T;
  kind: 'key';
}>;

type ScriptArg<N extends string, T extends NumberConstructor | StringConstructor> = Readonly<{
  name: N;
  type: T;
  kind: 'arg';
}>;

type ScriptDefinition<
  T extends ReadonlyArrayOf<ScriptArg<any, any> | ScriptKey<any, any>>,
  U extends { type: NumberConstructor | StringConstructor },
> = {
  name: string;
  input: T;
  output: U;
  sourceCode: string;
};

type AsNullable<T, U> = U extends true ? Maybe<T> : T;

type MapCtorType<T> = T extends NumberConstructor ? number : T extends StringConstructor ? string : never;

type MapScriptParameter<T> = T extends ScriptArg<any, any> | ScriptKey<any, any>
  ? Record<T['name'], MapCtorType<T['type']>>
  : never;

type ConstructScriptInput<T extends ReadonlyArrayOf<unknown>> = T extends readonly [infer P, ...infer A]
  ? MapScriptParameter<P> & ConstructScriptInput<A>
  : {};

function defineScriptKey<N extends string, T extends StringConstructor>(name: N, type: T): ScriptKey<N, T> {
  return {
    name,
    type,
    kind: 'key',
  };
}

function defineScriptArg<N extends string, T extends NumberConstructor | StringConstructor>(
  name: N,
  type: T,
): ScriptArg<N, T> {
  return {
    name,
    type,
    kind: 'arg',
  };
}

function validate(value: unknown, ctor: StringConstructor | NumberConstructor) {
  if (ctor === String) {
    return isString(value);
  }

  if (ctor === Number) {
    return isNumber(value);
  }

  return false;
}

function getCtorName(ctor: StringConstructor | NumberConstructor) {
  if (ctor === String) {
    return 'string';
  }

  if (ctor === Number) {
    return 'number';
  }

  return 'unknown';
}

function defineRedisLuaScript<
  T extends ReadonlyArrayOf<ScriptArg<any, any> | ScriptKey<any, any>>,
  U extends { type: NumberConstructor | StringConstructor; nullable?: boolean },
>(scriptDef: ScriptDefinition<T, U>) {
  const hash = createSHA1Hash(scriptDef.sourceCode);

  return async function <I extends ConstructScriptInput<T>>(client: RedisClient, input: I) {
    type Keys = T[number]['name'];

    const scriptKeys: ArrayOf<I[Keys]> = [];
    const scriptArgs: ArrayOf<I[Keys]> = [];

    for (const scriptKeyOrArg of scriptDef.input) {
      const name: keyof I = scriptKeyOrArg.name;
      const value = input[name];

      if (!validate(value, scriptKeyOrArg.type)) {
        throw new ValidationError(
          `[${scriptDef.name}]: Expected ${getCtorName(scriptKeyOrArg.type)}, but was ${
            value === null ? value : typeof value
          }`,
          scriptKeyOrArg.name,
        );
      }

      if (scriptKeyOrArg.kind === 'key') {
        scriptKeys.push(value);
      } else {
        scriptArgs.push(value);
      }
    }

    const result = await execLuaScript<AsNullable<MapCtorType<U['type']>, U['nullable']>>(
      client,
      scriptDef.sourceCode,
      hash,
      scriptKeys,
      scriptArgs,
    );

    if (!validate(result, scriptDef.output.type)) {
      throw new ValidationError(
        `[${scriptDef.name}]: Expected ${getCtorName(scriptDef.output.type)}, but was ${
          result === null ? result : typeof result
        } in result`,
      );
    }

    return result;
  };
}

const tryToAcquireLock = defineRedisLuaScript({
  name: 'TRY_TO_ACQUIRE_LOCK',
  sourceCode: LUA_SOURCE_CODE.TRY_TO_ACQUIRE_LOCK,
  input: [
    defineScriptKey('resourceId', String),
    defineScriptArg('ownerId', String),
    defineScriptArg('maxLockTimeMillis', Number),
  ],
  output: {
    type: String,
    // TODO: think of a better way to specify the return type
    nullable: true,
  },
} as const);

const tryToReleaseLock = defineRedisLuaScript({
  name: 'TRY_TO_RELEASE_LOCK',
  sourceCode: LUA_SOURCE_CODE.TRY_TO_RELEASE_LOCK,
  input: [defineScriptKey('resourceId', String), defineScriptArg('ownerId', String)],
  output: {
    type: Number,
  },
} as const);

const tryToIncrementCounter = defineRedisLuaScript({
  name: 'TRY_TO_INCREMENT_COUNTER',
  sourceCode: LUA_SOURCE_CODE.TRY_TO_INCREMENT_COUNTER,
  input: [
    defineScriptKey('sharedResourceId', String),
    defineScriptArg('ownerId', String),
    defineScriptArg('maxSharedResourceOwners', Number),
    defineScriptArg('maxLockTimeMillis', Number),
    defineScriptArg('currentTimeMillis', Number),
  ],
  output: {
    type: Number,
  },
} as const);

const tryToDecrementCounter = defineRedisLuaScript({
  name: 'TRY_TO_DECREMENT_COUNTER',
  sourceCode: LUA_SOURCE_CODE.TRY_TO_DECREMENT_COUNTER,
  input: [defineScriptKey('sharedResourceId', String), defineScriptArg('ownerId', String)],
  output: {
    type: Number,
  },
} as const);

export default {
  tryToAcquireLock,
  tryToReleaseLock,
  tryToIncrementCounter,
  tryToDecrementCounter,
} as const;
