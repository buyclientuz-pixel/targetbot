interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVPutOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

interface KVPutOptions {
  expiration?: number;
  expirationTtl?: number;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream | Blob, options?: R2PutOptions): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
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

declare type Env = Record<string, unknown> & {
  DB: KVNamespace;
  R2: R2Bucket;
};
