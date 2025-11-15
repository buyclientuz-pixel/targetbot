export class KvClient {
  constructor(private readonly kv: KVNamespace) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async put(key: string, value: string, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, value, options);
  }

  async putJson(key: string, value: unknown, options?: KVPutOptions): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), options);
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async list(prefix: string, options?: { limit?: number; cursor?: string }): Promise<{ keys: string[]; cursor?: string }> {
    const result = await this.kv.list({
      prefix,
      limit: options?.limit,
      cursor: options?.cursor,
    });
    return {
      keys: result.keys.map((entry) => entry.name),
      cursor: result.cursor,
    };
  }
}
