/// <reference path="../../types/cloudflare.d.ts" />

export class MemoryKVNamespace implements KVNamespace {
  private readonly store = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete?: boolean;
    cursor?: string;
  }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? Number.POSITIVE_INFINITY;
    const keys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(prefix))
      .sort();
    const slice = keys.slice(0, Number.isFinite(limit) ? limit : undefined);
    return {
      keys: slice.map((name) => ({ name })),
      list_complete: slice.length === keys.length,
      cursor: undefined,
    };
  }
}

class MemoryR2ObjectBody implements R2ObjectBody {
  constructor(private readonly value: string) {}

  async text(): Promise<string> {
    return this.value;
  }

  async json<T>(): Promise<T> {
    return JSON.parse(this.value) as T;
  }
}

interface StoredObject {
  key: string;
  value: string;
  uploaded: string;
}

export class MemoryR2Bucket implements R2Bucket {
  private readonly store = new Map<string, StoredObject>();

  async get(key: string): Promise<R2ObjectBody | null> {
    const entry = this.store.get(key);
    return entry ? new MemoryR2ObjectBody(entry.value) : null;
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream | Blob): Promise<R2Object | null> {
    let serialised: string;
    if (typeof value === "string") {
      serialised = value;
    } else if (value instanceof Blob) {
      serialised = await value.text();
    } else if (value instanceof ArrayBuffer) {
      serialised = new TextDecoder().decode(new Uint8Array(value));
    } else if (value instanceof ReadableStream) {
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      for (let next = await reader.read(); !next.done; next = await reader.read()) {
        chunks.push(next.value);
      }
      const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      serialised = new TextDecoder().decode(merged);
    } else {
      serialised = String(value);
    }

    const uploaded = new Date().toISOString();
    const record: StoredObject = { key, value: serialised, uploaded };
    this.store.set(key, record);
    return { key, size: Buffer.byteLength(serialised), uploaded };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ objects: R2Object[]; cursor?: string }> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? Number.POSITIVE_INFINITY;
    const objects = Array.from(this.store.values())
      .filter((entry) => entry.key.startsWith(prefix))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    const slice = objects.slice(0, Number.isFinite(limit) ? limit : undefined);
    return {
      objects: slice.map((entry) => ({ key: entry.key, size: Buffer.byteLength(entry.value), uploaded: entry.uploaded })),
      cursor: undefined,
    };
  }
}

export class TestExecutionContext implements ExecutionContext {
  private readonly tasks: Promise<unknown>[] = [];

  waitUntil(promise: Promise<unknown>): void {
    this.tasks.push(promise);
  }

  async flush(): Promise<void> {
    if (this.tasks.length === 0) {
      return;
    }
    await Promise.allSettled(this.tasks);
  }
}
