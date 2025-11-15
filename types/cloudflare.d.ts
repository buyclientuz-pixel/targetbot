interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete?: boolean;
    cursor?: string;
  }>;
}

interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream | Blob, options?: R2PutOptions): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: R2Object[];
    truncated?: boolean;
    cursor?: string;
  }>;
}

interface R2ObjectBody {
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
  };
}

interface R2Object {
  key: string;
  size: number;
  uploaded: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron?: string;
  type?: string;
  noRetry?: boolean;
  waitUntil(promise: Promise<unknown>): void;
}

interface URLPatternResult {
  pathname: {
    input: string;
    groups: Record<string, string>;
  };
}

interface URLPatternInit {
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  baseURL?: string;
}

declare class URLPattern {
  constructor(init?: URLPatternInit | string, baseURL?: string);
  exec(input: string | URL): URLPatternResult | null;
  test(input: string | URL): boolean;
}

declare type Env = Record<string, unknown> & {
  KV: KVNamespace;
  R2: R2Bucket;
};
