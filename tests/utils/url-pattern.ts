class SimpleURLPattern {
  private readonly segments: string[];

  constructor(init?: string | URLPatternInit, baseURL?: string) {
    const pathname = typeof init === "string" ? new URL(init, baseURL).pathname : init?.pathname ?? "";
    this.segments = pathname.split("/").filter(Boolean);
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

  test(input: string | URL): boolean {
    return this.exec(input) !== null;
  }
}

if (!("URLPattern" in globalThis)) {
  (globalThis as Record<string, unknown>).URLPattern = SimpleURLPattern as unknown;
}

export {}; 
