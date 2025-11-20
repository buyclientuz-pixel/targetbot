declare class Buffer {
  static byteLength(string: string | ArrayBuffer | ArrayBufferView): number;
}
declare var Buffer: typeof Buffer;

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
    fail(message?: string): never;
    ok(value: unknown, message?: string): asserts value;
    strictEqual(actual: unknown, expected: unknown, message?: string): void;
    notStrictEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown | Promise<unknown>, error?: RegExp | Error | Function | object, message?: string): void;
    rejects(fn: () => Promise<unknown>, error?: RegExp | Error | Function | object, message?: string): Promise<void>;
    match(actual: string, expected: RegExp, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:test" {
  interface TestContext {
    diagnostic(message: string): void;
    plan(count: number): void;
    skip(message?: string): void;
    test(name: string, fn: TestFn): void;
  }

  interface TestOptions {
    skip?: boolean;
    only?: boolean;
    timeout?: number;
    concurrency?: boolean | number;
  }

  type TestFn = (context?: TestContext) => void | Promise<void>;

  function test(name: string, fn: TestFn): void;
  function test(name: string, options: TestOptions, fn: TestFn): void;
  function describe(name: string, fn: TestFn): void;
  function it(name: string, fn: TestFn): void;

  namespace test {
    const skip: typeof test;
    const only: typeof test;
  }

  export = test;
  export { describe, it };
}

declare module "node:vm" {
  class Script {
    constructor(code: string);
    runInNewContext<T = unknown>(context?: object): T;
  }

  function runInNewContext<T = unknown>(code: string, context?: object): T;

  export { Script, runInNewContext };
}

declare module "node:buffer" {
  export { Buffer };
}

declare const console: Console;
