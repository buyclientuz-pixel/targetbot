type ProgressLogFn = (message: string, meta?: ProgressSnapshot | Record<string, unknown>) => void;

export interface ProgressSnapshot {
  iteration: number;
  total: number;
  completed?: string;
  next?: string | null;
  remaining: number;
}

const defaultLogger: ProgressLogFn = (message, meta) => {
  if (meta) {
    console.log(message, meta);
  } else {
    console.log(message);
  }
};

export class ProgressReporter {
  private readonly steps: string[];

  private readonly logger: ProgressLogFn;

  private index = 0;

  constructor(steps: string[], logger: ProgressLogFn = defaultLogger) {
    this.steps = steps.length ? [...steps] : ["task"];
    this.logger = logger;
  }

  start(): ProgressSnapshot {
    const snapshot = this.snapshot();
    this.logger(this.format("start", snapshot), snapshot);
    return snapshot;
  }

  complete(description?: string, nextHint?: string | null): ProgressSnapshot {
    const completed = description ?? this.steps[this.index] ?? `step-${this.index + 1}`;
    if (this.index < this.steps.length) {
      this.index += 1;
    }
    const snapshot = this.snapshot(completed, nextHint);
    this.logger(this.format("complete", snapshot), snapshot);
    return snapshot;
  }

  private snapshot(completed?: string, nextHint?: string | null): ProgressSnapshot {
    const remaining = Math.max(this.steps.length - this.index, 0);
    const next =
      typeof nextHint === "string"
        ? nextHint
        : nextHint === null
          ? null
          : this.steps[this.index] ?? null;
    return {
      iteration: Math.min(this.index, this.steps.length),
      total: this.steps.length,
      completed,
      next,
      remaining,
    };
  }

  private format(event: "start" | "complete", snapshot: ProgressSnapshot): string {
    const prefix =
      event === "start"
        ? `Iteration 0/${snapshot.total} scheduled`
        : `Iteration ${snapshot.iteration}/${snapshot.total} completed`;
    const next = snapshot.next ? `next: ${snapshot.next}` : "next: none";
    return `[progress] ${prefix} (${next}, remaining: ${snapshot.remaining})`;
  }
}

export const createConsoleProgressReporter = (steps: string[]): ProgressReporter =>
  new ProgressReporter(steps, defaultLogger);

