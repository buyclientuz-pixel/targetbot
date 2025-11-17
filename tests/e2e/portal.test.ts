import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { renderPortalHtml } from "../../src/routes/portal.ts";

class FakeClassList {
  private readonly classes = new Set<string>();

  constructor(initial: string[] = []) {
    for (const value of initial) {
      this.classes.add(value);
    }
  }

  add(value: string): void {
    this.classes.add(value);
  }

  remove(value: string): void {
    this.classes.delete(value);
  }

  toggle(value: string, force?: boolean): boolean {
    if (force === undefined) {
      if (this.classes.has(value)) {
        this.classes.delete(value);
        return false;
      }
      this.classes.add(value);
      return true;
    }
    if (force) {
      this.classes.add(value);
      return true;
    }
    this.classes.delete(value);
    return false;
  }

  contains(value: string): boolean {
    return this.classes.has(value);
  }
}

class FakeNodeList<T> implements Iterable<T> {
  constructor(private readonly items: T[]) {}

  forEach(callback: (item: T) => void): void {
    this.items.forEach(callback);
  }

  get length(): number {
    return this.items.length;
  }

  [Symbol.iterator](): Iterator<T> {
    return this.items[Symbol.iterator]();
  }
}

class FakeElement {
  public readonly classList: FakeClassList;
  public readonly style: Record<string, string> = {};
  public textContent = "";
  public innerHTML = "";
  private children: FakeElement[] = [];
  private readonly attributes = new Map<string, string>();
  private readonly childSelectors = new Map<string, FakeElement>();

  constructor(attrs: Record<string, string> = {}, classes: string[] = []) {
    this.classList = new FakeClassList(classes);
    for (const [key, value] of Object.entries(attrs)) {
      this.attributes.set(key, value);
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  setChild(selector: string, element: FakeElement): void {
    this.childSelectors.set(selector, element);
  }

  querySelector(selector: string): FakeElement | null {
    return this.childSelectors.get(selector) ?? null;
  }

  querySelectorAll(selector: string): FakeNodeList<FakeElement> {
    const child = this.childSelectors.get(selector);
    return child ? new FakeNodeList([child]) : new FakeNodeList([]);
  }

  appendChild(child: FakeElement): void {
    this.children.push(child);
  }

  removeChild(child: FakeElement): void {
    this.children = this.children.filter((entry) => entry !== child);
  }

  click(): void {
    // noop for tests
  }

  addEventListener(): void {
    // no-op for tests
  }
}

interface PortalHarness {
  document: FakeDocument;
  elements: ReturnType<FakeDocument["getElements"]>;
  context: Record<string, unknown>;
}

class FakeDocument {
  public title = "";
  public readonly body: FakeElement = new FakeElement();
  private readonly singles = new Map<string, FakeElement>();
  private readonly lists = new Map<string, FakeNodeList<FakeElement>>();
  private readonly elementsCache: {
    preloader: FakeElement;
    error: FakeElement;
    errorMessage: FakeElement;
    content: FakeElement;
    projectTitle: FakeElement;
    projectDescription: FakeElement;
    summaryPeriod: FakeElement;
    leadsBody: FakeElement;
    leadsEmpty: FakeElement;
    leadsSkeleton: FakeElement;
    leadsPeriod: FakeElement;
    campaignsBody: FakeElement;
    campaignsEmpty: FakeElement;
    campaignsSkeleton: FakeElement;
    campaignsPeriod: FakeElement;
    paymentsBody: FakeElement;
    paymentsEmpty: FakeElement;
    paymentsSkeleton: FakeElement;
    paymentsSubtitle: FakeElement;
    metrics: Array<{ element: FakeElement; value: FakeElement }>;
    periodButtons: FakeElement[];
    retryButtons: FakeElement[];
    errorOverlay: FakeElement;
  };

  constructor() {
    const preloader = new FakeElement();
    const error = new FakeElement({}, ["portal__error--hidden"]);
    const errorMessage = new FakeElement();
    const content = new FakeElement();
    const projectTitle = new FakeElement();
    const projectDescription = new FakeElement();
    const summaryPeriod = new FakeElement();
    const leadsBody = new FakeElement();
    const leadsEmpty = new FakeElement({}, ["portal-empty", "portal-empty--hidden"]);
    const leadsSkeleton = new FakeElement();
    const leadsPeriod = new FakeElement();
    const campaignsBody = new FakeElement();
    const campaignsEmpty = new FakeElement({}, ["portal-empty", "portal-empty--hidden"]);
    const campaignsSkeleton = new FakeElement();
    const campaignsPeriod = new FakeElement();
    const paymentsBody = new FakeElement();
    const paymentsEmpty = new FakeElement({}, ["portal-empty", "portal-empty--hidden"]);
    const paymentsSkeleton = new FakeElement();
    const paymentsSubtitle = new FakeElement();
    const leadsSection = new FakeElement();
    const campaignsSection = new FakeElement();
    const paymentsSection = new FakeElement();
    const exportSection = new FakeElement();
    const retryLeads = new FakeElement();
    const retryCampaigns = new FakeElement();
    const retryPayments = new FakeElement();
    const exportLeads = new FakeElement();
    const exportCampaigns = new FakeElement();
    const exportSummary = new FakeElement();

    const metricKeys = [
      "spend",
      "impressions",
      "clicks",
      "leads",
      "cpa",
      "leads-total",
      "leads-today",
      "cpa-today",
    ];
    const metrics = metricKeys.map((key) => {
      const element = new FakeElement({ "data-metric": key });
      const value = new FakeElement({ "data-metric-value": "" });
      element.setChild("[data-metric-value]", value);
      return { element, value };
    });

    const periodKeys = ["today", "yesterday", "week", "month", "all"];
    const periodButtons = periodKeys.map((key) => new FakeElement({ "data-period-button": key }));

    const retryButtons = [new FakeElement({ "data-retry": "" })];

    const singles: Record<string, FakeElement> = {
      "[data-preloader]": preloader,
      "[data-error]": error,
      "[data-error-message]": errorMessage,
      "[data-content]": content,
      "[data-project-title]": projectTitle,
      "[data-project-description]": projectDescription,
      "[data-summary-period]": summaryPeriod,
      "[data-leads-body]": leadsBody,
      "[data-leads-empty]": leadsEmpty,
      "[data-leads-skeleton]": leadsSkeleton,
      "[data-leads-period]": leadsPeriod,
      "[data-section=\"leads\"]": leadsSection,
      "[data-section=\"campaigns\"]": campaignsSection,
      "[data-section=\"payments\"]": paymentsSection,
      "[data-section=\"export\"]": exportSection,
      "[data-campaigns-body]": campaignsBody,
      "[data-campaigns-empty]": campaignsEmpty,
      "[data-campaigns-skeleton]": campaignsSkeleton,
      "[data-campaigns-period]": campaignsPeriod,
      "[data-payments-body]": paymentsBody,
      "[data-payments-empty]": paymentsEmpty,
      "[data-payments-skeleton]": paymentsSkeleton,
      "[data-payments-subtitle]": paymentsSubtitle,
      "[data-retry-leads]": retryLeads,
      "[data-retry-campaigns]": retryCampaigns,
      "[data-retry-payments]": retryPayments,
      "[data-export-leads]": exportLeads,
      "[data-export-campaigns]": exportCampaigns,
      "[data-export-summary]": exportSummary,
    };

    for (const [selector, element] of Object.entries(singles)) {
      this.singles.set(selector, element);
    }

    this.lists.set("[data-metric]", new FakeNodeList(metrics.map((entry) => entry.element)));
    this.lists.set("[data-period-button]", new FakeNodeList(periodButtons));
    this.lists.set("[data-retry]", new FakeNodeList(retryButtons));

    this.elementsCache = {
      preloader,
      error,
      errorMessage,
      content,
      projectTitle,
      projectDescription,
      summaryPeriod,
      leadsBody,
      leadsEmpty,
      leadsSkeleton,
      leadsPeriod,
      campaignsBody,
      campaignsEmpty,
      campaignsSkeleton,
      campaignsPeriod,
      paymentsBody,
      paymentsEmpty,
      paymentsSkeleton,
      paymentsSubtitle,
      metrics,
      periodButtons,
      retryButtons,
      errorOverlay: error,
    };
  }

  createElement(): FakeElement {
    return new FakeElement();
  }

  querySelector(selector: string): FakeElement | null {
    return this.singles.get(selector) ?? null;
  }

  querySelectorAll(selector: string): FakeNodeList<FakeElement> {
    return this.lists.get(selector) ?? new FakeNodeList([]);
  }

  getElements(): typeof this.elementsCache {
    return this.elementsCache;
  }
}

const extractScript = (html: string): string => {
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>");
  if (start === -1 || end === -1) {
    throw new Error("Portal script not found");
  }
  return html.slice(start + "<script>".length, end);
};

const createHarness = (): PortalHarness => {
  const document = new FakeDocument();
  const elements = document.getElements();
  const location = { search: "" };
  const context: Record<string, unknown> = {
    document,
    window: {},
    console,
    setTimeout,
    clearTimeout,
    Intl,
    Promise,
    Blob,
    URL,
    URLSearchParams,
    location,
    AbortController,
  };
  const windowRef = context.window as Record<string, unknown>;
  windowRef.window = windowRef;
  windowRef.document = document;
  windowRef.console = console;
  windowRef.Intl = Intl;
  windowRef.Promise = Promise;
  windowRef.setTimeout = setTimeout;
  windowRef.clearTimeout = clearTimeout;
  windowRef.Blob = Blob;
  windowRef.URL = URL;
  windowRef.URLSearchParams = URLSearchParams;
  windowRef.location = location;
  windowRef.AbortController = AbortController;
  return { document, elements, context };
};

const flushMicrotasks = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

test("portal hides preloader and renders sections when data loads", async () => {
  const html = renderPortalHtml("birlash");
  const script = extractScript(html);
  const { context, elements } = createHarness();

  const wrap = (data: unknown) =>
    new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const responses = new Map<string, unknown>([
    [
      "/api/projects/birlash",
      {
        project: {
          id: "birlash",
          name: "birlash",
          portalUrl: "https://th-reports.buyclientuz.workers.dev/p/birlash",
        },
      },
    ],
    [
      "/api/projects/birlash/summary?period=today",
      {
        project: { id: "birlash", name: "birlash", portalUrl: "https://example.com" },
        periodKey: "today",
        period: { from: "2025-11-15", to: "2025-11-15" },
        metrics: {
          spend: 16.15,
          impressions: 1000,
          clicks: 120,
          leads: 5,
          messages: 2,
          cpa: 3.23,
          leadsTotal: 168,
          leadsToday: 2,
          cpaToday: 1.33,
          currency: "USD",
          kpiLabel: "Лиды",
        },
      },
    ],
    [
      "/api/projects/birlash/leads/today",
      {
        projectId: "birlash",
        periodKey: "today",
        period: { from: "2025-11-15T00:00:00.000Z", to: "2025-11-15T23:59:59.000Z" },
        stats: { total: 168, today: 2 },
        syncedAt: "2025-11-15T12:00:00.000Z",
        leads: [
          {
            id: "lead-1",
            name: "Sharofat Ona",
            contact: "+998902867999",
            phone: "+998902867999",
            campaignName: "Лиды - тест",
            createdAt: "2025-11-15T10:00:00.000Z",
            status: "new",
            type: "lead",
          },
        ],
      },
    ],
    [
      "/api/projects/birlash/leads/today/refresh",
      {
        projectId: "birlash",
        periodKey: "today",
        period: { from: "2025-11-15T00:00:00.000Z", to: "2025-11-15T23:59:59.000Z" },
        stats: { total: 168, today: 2 },
        syncedAt: new Date().toISOString(),
        leads: [
          {
            id: "lead-1",
            name: "Sharofat Ona",
            contact: "+998902867999",
            phone: "+998902867999",
            campaignName: "Лиды - тест",
            createdAt: "2025-11-15T10:00:00.000Z",
            status: "new",
            type: "lead",
          },
        ],
      },
    ],
    [
      "/api/projects/birlash/campaigns?period=today",
      {
        period: { from: "2025-11-15", to: "2025-11-15" },
        periodKey: "today",
        summary: { spend: 16.15, impressions: 1000, clicks: 120, leads: 5, messages: 2 },
        campaigns: [
          {
            id: "cmp-1",
            name: "Campaign A",
            objective: "LEAD_GENERATION",
            kpiType: "LEAD",
            spend: 16.15,
            impressions: 1000,
            clicks: 120,
            leads: 5,
            messages: 0,
          },
        ],
        kpi: { mode: "auto", type: "LEAD", label: "Лиды" },
      },
    ],
    [
      "/api/projects/birlash/payments",
      {
        billing: { tariff: 500, currency: "USD", nextPaymentDate: "2025-12-15", autobilling: true },
        payments: [
          {
            id: "pay-1",
            amount: 500,
            currency: "USD",
            periodFrom: "2025-11-15",
            periodTo: "2025-12-15",
            paidAt: "2025-11-15T17:11:00.000Z",
            status: "paid",
            comment: "Оплата",
          },
        ],
      },
    ],
  ]);

  const fetchCalls: string[] = [];
  const fetchMock = async (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, "https://example.com");
    const key = parsed.pathname + parsed.search;
    fetchCalls.push(key);
    const data = responses.get(key);
    if (!data) {
      return { ok: false, status: 404, json: async () => ({ ok: false }), text: async () => "not found" };
    }
    return wrap(data);
  };

  context.fetch = fetchMock;
  (context.window as Record<string, unknown>).fetch = fetchMock;

  vm.runInNewContext(script, context);
  await flushMicrotasks();

  assert.ok(fetchCalls.includes("/api/projects/birlash"));
  assert.ok(fetchCalls.includes("/api/projects/birlash/summary?period=today"));
  assert.ok(elements.preloader.classList.contains("portal__preloader--hidden"));
  assert.ok(elements.content.classList.contains("portal__content--visible"));
  assert.notEqual(elements.leadsBody.innerHTML, "");
  assert.ok(elements.error.classList.contains("portal__error--hidden"));
  assert.ok(elements.paymentsSubtitle.textContent.includes("Тариф"));
});

test("portal shows error overlay if summary loading times out", async () => {
  const html = renderPortalHtml("birlash");
  const script = extractScript(html);
  const { context, elements } = createHarness();

  const fetchCalls: string[] = [];
  const fetchMock = (input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, "https://example.com");
    const key = parsed.pathname + parsed.search;
    fetchCalls.push(key);
    if (key === "/api/projects/birlash") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, data: { project: { id: "birlash", name: "birlash", portalUrl: "#" } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }
    if (key.startsWith("/api/projects/birlash/summary")) {
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted');
          (error as Error & { name: string }).name = 'AbortError';
          reject(error);
        });
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify({ ok: true, data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  };

  const timers: Array<{ id: number; delay: number; callback: () => void }> = [];
  let timerId = 1;
  const customSetTimeout = (handler: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) => {
    const callback = () => handler(...args);
    timers.push({ id: timerId, delay, callback });
    return timerId++;
  };
  const customClearTimeout = (id: number) => {
    const index = timers.findIndex((timer) => timer.id === id);
    if (index !== -1) {
      timers.splice(index, 1);
    }
  };

  context.fetch = fetchMock as typeof fetch;
  const windowRef = context.window as Record<string, unknown>;
  windowRef.fetch = fetchMock;
  context.setTimeout = customSetTimeout;
  context.clearTimeout = customClearTimeout;
  windowRef.setTimeout = customSetTimeout;
  windowRef.clearTimeout = customClearTimeout;

  vm.runInNewContext(script, context);
  await flushMicrotasks();

  assert.ok(fetchCalls.length >= 2);
  const timeout = timers.find((timer) => timer.delay === 12000);
  assert.ok(timeout);
  timeout?.callback();
  await flushMicrotasks();

  assert.ok(elements.preloader.classList.contains("portal__preloader--hidden"));
  assert.ok(!elements.error.classList.contains("portal__error--hidden"));
});
