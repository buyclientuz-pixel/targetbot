import { KvClient } from "../infra/kv";
import { R2Client } from "../infra/r2";
import type { WorkerRequestState, WorkerContextOptions, TargetBotEnv } from "./types";

export interface RequestContext {
  readonly request: Request;
  readonly env: TargetBotEnv;
  readonly executionCtx: ExecutionContext;
  readonly state: WorkerRequestState;
  readonly kv: KvClient;
  readonly r2: R2Client;
  waitUntil(promise: Promise<unknown>): void;
  json<T>(): Promise<T>;
  text(): Promise<string>;
  setParams(params: Record<string, string>): void;
}

class DefaultRequestContext implements RequestContext {
  public readonly kv: KvClient;
  public readonly r2: R2Client;

  constructor(
    public readonly request: Request,
    public readonly env: TargetBotEnv,
    public readonly executionCtx: ExecutionContext,
    public readonly state: WorkerRequestState,
    private readonly options: WorkerContextOptions,
  ) {
    this.kv = new KvClient(env.KV);
    this.r2 = new R2Client(env.R2);
  }

  waitUntil(promise: Promise<unknown>): void {
    this.executionCtx.waitUntil(promise);
  }

  json<T>(): Promise<T> {
    return this.request.json() as Promise<T>;
  }

  text(): Promise<string> {
    return this.request.text();
  }

  setParams(params: Record<string, string>): void {
    this.state.params = params;
  }

  get corsOptions(): Required<WorkerContextOptions["cors"]> {
    const cors = this.options.cors ?? {};
    return {
      allowOrigin: cors.allowOrigin ?? "*",
      allowMethods: cors.allowMethods ?? "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      allowHeaders: cors.allowHeaders ?? "content-type,authorization,x-request-id",
    };
  }
}

export const createRequestContext = (
  request: Request,
  env: TargetBotEnv,
  executionCtx: ExecutionContext,
  options?: WorkerContextOptions,
): RequestContext => {
  return new DefaultRequestContext(
    request,
    env,
    executionCtx,
    { params: {} },
    options ?? {},
  );
};
