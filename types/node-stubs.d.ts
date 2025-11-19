declare class Buffer {
  static byteLength(string: string | ArrayBuffer | ArrayBufferView): number;
}
declare var Buffer: typeof Buffer;

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    fail(message?: string): never;
    ok(value: unknown, message?: string): asserts value;
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

declare module "node:buffer" {
  export { Buffer };
}

declare const console: Console;
