export class R2Client {
  constructor(private readonly bucket: R2Bucket) {}

  async get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const object = await this.bucket.get(key);
    if (!object) {
      return null;
    }
    return object.json<T>();
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream | Blob,
    options?: R2PutOptions,
  ): Promise<R2Object | null> {
    return this.bucket.put(key, value, options);
  }

  async putJson(key: string, value: unknown, options?: R2PutOptions): Promise<R2Object | null> {
    const body = JSON.stringify(value);
    return this.bucket.put(key, body, {
      ...options,
      httpMetadata: {
        contentType: "application/json",
        ...(options?.httpMetadata ?? {}),
      },
    });
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async list(
    prefix: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ objects: R2Object[]; cursor?: string }> {
    const result = await this.bucket.list({
      prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });
    return {
      objects: result.objects,
      cursor: result.cursor,
    };
  }
}
