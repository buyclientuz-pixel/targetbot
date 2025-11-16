class SimpleURLPattern {
  private readonly segments: string[];

  constructor(init: { pathname: string }) {
    this.segments = init.pathname.split("/").filter(Boolean);
  }

  exec(input: string | URL) {
    const target = typeof input === "string" ? new URL(input) : input;
    const pathSegments = target.pathname.split("/").filter(Boolean);
    if (pathSegments.length !== this.segments.length) {
      return null;
    }
    const groups: Record<string, string> = {};
    for (let index = 0; index < this.segments.length; index += 1) {
      const patternSegment = this.segments[index]!;
      const actual = pathSegments[index]!;
      if (patternSegment.startsWith(":")) {
        groups[patternSegment.slice(1)] = actual;
      } else if (patternSegment !== actual) {
        return null;
      }
    }
    return { pathname: { input: target.pathname, groups } };
  }
}

if (!("URLPattern" in globalThis)) {
  (globalThis as unknown as { URLPattern: typeof SimpleURLPattern }).URLPattern = SimpleURLPattern as typeof URLPattern;
}

export {}; 
