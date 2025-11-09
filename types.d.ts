interface KVNamespaceListKey {
  name: string;
  expiration?: number;
  metadata?: unknown;
}

interface KVNamespaceListResult {
  keys: KVNamespaceListKey[];
  list_complete: boolean;
  cursor: string;
}

interface KVNamespaceListOptions {
  limit?: number;
  prefix?: string;
  reverse?: boolean;
  cursor?: string;
}

interface KVNamespacePutOptions {
  expiration?: number;
  expirationTtl?: number;
  metadata?: unknown;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: KVNamespaceListOptions): Promise<KVNamespaceListResult>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Minimal Node.js environment shims for local type-checking when @types/node
// cannot be installed in the sandbox. These declarations intentionally cover
// only the APIs referenced in the source code and are compatible with the real
// runtime definitions when available.

declare interface NodeProcess {
  env: Record<string, string | undefined>;
}

declare const process: NodeProcess;

declare class BufferShim {
  toString(encoding?: string): string;
}

declare const Buffer: {
  from(input: string | ArrayBuffer | BufferShim, encoding?: string): BufferShim;
};

declare module "node:crypto" {
  export interface Hmac {
    update(data: string | ArrayBufferView): Hmac;
    digest(encoding: "hex" | "base64" | "base64url"): string;
  }

  export interface RandomBytes {
    (size: number): BufferShim;
  }

  export function randomBytes(size: number): BufferShim;
  export function randomUUID(): string;
  export function createHmac(algorithm: string, secret: string | BufferShim): Hmac;

  const crypto: {
    randomBytes: typeof randomBytes;
    randomUUID: typeof randomUUID;
    createHmac: typeof createHmac;
  };

  export default crypto;
}

declare module "grammy" {
  export type MaybePromise<T> = Promise<T> | T;

  export interface CallbackQuery {
    id: string;
    data?: string;
    message?: unknown;
  }

  export interface TelegramChat {
    id: number;
    title?: string;
  }

  export interface TelegramMessage {
    message_id?: number;
    text?: string;
    forward_from_chat?: TelegramChat;
    forward_origin?: { type?: string; chat?: TelegramChat };
    is_topic_message?: boolean;
    message_thread_id?: number;
  }

  export interface Context {
    chat?: TelegramChat;
    from?: { id: number };
    match?: RegExpExecArray | string | null;
    callbackQuery?: CallbackQuery;
    message?: TelegramMessage;
    reply(text: string, extra?: unknown): Promise<unknown>;
    editMessageText(text: string, extra?: unknown): Promise<unknown>;
    answerCallbackQuery(params?: { text?: string; show_alert?: boolean }): Promise<void>;
    conversation?: { enter(name: string): Promise<void> };
    api: {
      sendMessage(chatId: number, text: string, extra?: unknown): Promise<unknown>;
    };
  }

  export type NextFunction = () => Promise<void>;

  export type MiddlewareFn<C extends Context = Context> = (
    ctx: C,
    next: NextFunction
  ) => MaybePromise<unknown>;

  export class Composer<C extends Context = Context> {
    use(...middlewares: (MiddlewareFn<C> | Composer<C>)[]): this;
    command(trigger: string | RegExp, middleware: MiddlewareFn<C>): this;
    callbackQuery(trigger: string | RegExp, middleware: MiddlewareFn<C>): this;
    middleware(): MiddlewareFn<C>;
  }

  export class Bot<C extends Context = Context> extends Composer<C> {
    constructor(token: string);
    api: {
      config: {
        use(
          hook: (
            prev: (method: string, payload?: unknown) => Promise<unknown>,
            method: string,
            payload?: unknown
          ) => Promise<unknown>
        ): void;
      };
    };
    catch(handler: (error: unknown) => void): void;
    start(options?: unknown): Promise<void>;
  }

  export class InlineKeyboard {
    text(label: string, data: string): this;
    row(): this;
  }

  export interface SessionFlavor<T> {
    session: T;
  }

  export function session<T, C extends Context = Context>(
    options: { initial: () => T }
  ): MiddlewareFn<C & SessionFlavor<T>>;
}

declare module "@grammyjs/conversations" {
  import type { Context, MiddlewareFn } from "grammy";

  export interface Conversation<C extends Context = Context> {
    ctx: C;
    session: C extends { session: infer S } ? S : never;
    wait(messageFilter?: unknown): Promise<C>;
    waitFor(filter: unknown): Promise<C>;
  }

  export interface ConversationFlavor<C extends Context = Context> {
    conversation: {
      enter(name: string): Promise<void>;
    };
  }

  export function conversations<C extends Context = Context>(): MiddlewareFn<C & ConversationFlavor<C>>;

  export function createConversation<C extends Context = Context>(
    handler: (conversation: Conversation<C & ConversationFlavor<C>>, ctx: C & ConversationFlavor<C>) => Promise<void>,
    name?: string
  ): MiddlewareFn<C & ConversationFlavor<C>>;
}

declare module "@grammyjs/ratelimiter" {
  import type { Context, MiddlewareFn } from "grammy";

  export interface RateLimitOptions<C extends Context = Context> {
    timeFrame: number;
    limit: number;
    onLimitExceeded?: (ctx: C) => Promise<void> | void;
  }

  export function limit<C extends Context = Context>(options: RateLimitOptions<C>): MiddlewareFn<C>;
}

declare module "dayjs" {
  interface Dayjs {
    tz(tz: string): Dayjs;
    utc(): Dayjs;
    format(template?: string): string;
    subtract(amount: number, unit: string): Dayjs;
    toDate(): Date;
  }

  interface DayjsStatic {
    (value?: string | number | Date): Dayjs;
    extend(plugin: (option: DayjsStatic, config?: unknown) => void): void;
  }

  const dayjs: DayjsStatic;
  export default dayjs;
}

declare module "dayjs/plugin/timezone" {
  const plugin: (option: unknown, config?: unknown) => void;
  export default plugin;
}

declare module "dayjs/plugin/utc" {
  const plugin: (option: unknown, config?: unknown) => void;
  export default plugin;
}
