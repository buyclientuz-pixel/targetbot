declare interface R2Object {
  key: string;
  size: number;
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

declare interface R2ObjectsList {
  objects: Array<{ key: string; size: number; uploaded?: string }>;
  // Pagination info returned by some runtimes/SDKs
  truncated?: boolean;
  cursor?: string;
}

declare interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
}

declare interface R2PutOptions {
  httpMetadata?: Record<string, string>;
  customMetadata?: Record<string, string>;
}

declare interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: BodyInit | null, options?: R2PutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: R2ListOptions): Promise<R2ObjectsList>;
}

declare interface KVNamespaceListResult {
  keys: Array<{ name: string; expiration?: number; metadata?: unknown }>;
  list_complete?: boolean;
  cursor?: string;
}

declare interface KVNamespace {
  get(key: string, options?: { type?: "text" | "json" | "arrayBuffer" }): Promise<any>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView, options?: { expiration?: number; expirationTtl?: number; metadata?: unknown }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVNamespaceListResult>;
}

declare interface DurableObjectNamespace {}

declare interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

// Cloudflare runtime standard global types used in the codebase
declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

declare interface ScheduledEvent {
  // cron expression when scheduled via wrangler/Cloudflare
  cron?: string;
  // allow other runtime specific fields
  [key: string]: unknown;
}

declare interface WorkerEnv {
  [key: string]: unknown;
}
