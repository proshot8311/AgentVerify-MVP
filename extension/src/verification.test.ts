import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectActivePage } from "./content.ts";
import type {
  AttributeInspection,
  PageSnapshot,
  SelectorInspection,
  SelectorTextInspection,
} from "./content.ts";
import {
  createUnavailableResult,
  evaluateVerification,
  type VerificationInput,
} from "./verifier.ts";

interface MockElement {
  tagName: string;
  innerText: string;
  textContent: string;
  children: MockElement[];
  parentElement: MockElement | null;
  visible: boolean;
  attributes: Record<string, string>;
  getClientRects(): Array<object>;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): MockElement[];
}

function makeElement(
  tagName: string,
  text: string,
  children: MockElement[] = [],
  options: { visible?: boolean; attributes?: Record<string, string> } = {},
): MockElement {
  const element: MockElement = {
    tagName: tagName.toUpperCase(),
    innerText: text,
    textContent: text,
    children,
    parentElement: null,
    visible: options.visible ?? true,
    attributes: options.attributes ?? {},
    getClientRects() {
      return this.visible ? [{}] : [];
    },
    getAttribute(name: string) {
      return this.attributes[name] ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector !== "*") return [];
      return children.flatMap(child => [child, ...child.querySelectorAll("*")]);
    },
  };
  children.forEach(child => {
    child.parentElement = element;
  });
  return element;
}

function installMockPage(options: {
  body: MockElement | null;
  title?: string;
  url?: string;
  selectorMatches?: Record<string, MockElement[]>;
}): () => void {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: options.url ?? "https://github.com/example/repo/issues" },
      getComputedStyle: (element: MockElement) => ({
        display: element.visible ? "block" : "none",
        visibility: "visible",
        opacity: "1",
      }),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: options.body,
      title: options.title ?? "Repository · Issues",
      querySelectorAll: (selector: string) => options.selectorMatches?.[selector] ?? [],
    },
  });

  return () => {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  };
}

const emptySelector: SelectorInspection = {
  selector: "",
  error: "",
  matchCount: 0,
  visibleMatchCount: 0,
  visibleSamples: [],
};

const emptySelectorText: SelectorTextInspection = {
  ...emptySelector,
  matchingVisibleCount: 0,
  matchingSamples: [],
};

const emptyAttribute: AttributeInspection = {
  ...emptySelector,
  attributeName: "",
  matchingVisibleCount: 0,
  valueSamples: [],
  matchingSamples: [],
};

const baseInput: VerificationInput = {
  agentClaim: "The issue was created.",
  expectedUrl: "",
  urlMatchMode: "contains",
  requiredText: "Issue created",
  forbiddenText: "",
  expectedPageTitle: "Repository · Issues",
  minimumMatchingElements: 1,
  selectorExists: "",
  selectorTextSelector: "",
  selectorText: "",
  attributeSelector: "",
  attributeName: "",
  attributeValue: "",
  attributeMatchMode: "contains",
  targetSelector: "#target",
  pollIntervalMs: 500,
  timeoutMs: 5000,
};

function pageSnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    pageUrl: "https://github.com/example/repo/issues",
    pageTitle: "Repository · Issues",
    bodyAvailable: true,
    renderedBodyTextLength: 45,
    requiredTextFound: true,
    requiredTextExcerpt: "Issue created",
    forbiddenTextFound: null,
    forbiddenTextExcerpt: "",
    matchingElementCount: 1,
    matchingElementSamples: [{ tag: "span", text: "issue created" }],
    selectorExistence: emptySelector,
    selectorText: emptySelectorText,
    attributeValue: emptyAttribute,
    target: {
      selector: "#target",
      error: "",
      matchCount: 1,
      visibleMatchCount: 1,
      visibleSamples: [{ tag: "main", text: "Issue created" }],
      identity: "#target",
      fragileSelector: false,
    },
    ...overrides,
  };
}

test("inspects active-tab DOM text, visible counts, and action-specific selector attributes without fetching", () => {
  const createdButton = makeElement("button", "Issue #123 CREATED", [], {
    attributes: { "data-testid": "created-issue", "data-state": "complete" },
  });
  const issueLink = makeElement("a", "View issue", [], {
    attributes: { "data-testid": "created-issue-link", href: "/issues/123" },
  });
  const hiddenTemplate = makeElement("div", "Issue #123 created", [], { visible: false });
  const body = makeElement("body", "Issue #123 created. View issue.", [
    createdButton,
    issueLink,
    hiddenTemplate,
  ]);
  const restorePage = installMockPage({
    body,
    selectorMatches: {
      '[data-testid="created-issue"]': [createdButton],
      '[data-testid="created-issue-link"]': [issueLink],
      "#hidden-template": [hiddenTemplate],
    },
  });

  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let fetchCalled = false;
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: () => {
      fetchCalled = true;
      throw new Error("External fetch must not be used for tab inspection.");
    },
  });

  try {
    const observed = inspectActivePage({
      targetSelector: '[data-testid="created-issue"]',
      requiredText: "issue #123 created",
      forbiddenText: "permission denied",
      selectorExists: '[data-testid="created-issue"]',
      selectorTextSelector: '[data-testid="created-issue"]',
      selectorText: " issue #123   created ",
      attributeSelector: '[data-testid="created-issue-link"]',
      attributeName: "href",
      attributeValue: "/issues/123",
      attributeMatchMode: "contains",
    });

    assert.equal(observed.requiredTextFound, true);
    assert.equal(observed.forbiddenTextFound, false);
    assert.equal(observed.matchingElementCount, 1);
    assert.equal(observed.selectorExistence.visibleMatchCount, 1);
    assert.equal(observed.selectorText.matchingVisibleCount, 1);
    assert.equal(observed.attributeValue.matchingVisibleCount, 1);
    assert.equal(observed.attributeValue.valueSamples[0]?.value, "/issues/123");
    assert.equal(observed.pageUrl, "https://github.com/example/repo/issues");
    assert.equal(observed.target.matchCount, 1);
    assert.equal(observed.target.identity, 'data-testid="created-issue"');
    assert.equal(observed.target.fragileSelector, false);

    const hiddenSelector = inspectActivePage({ selectorExists: "#hidden-template" });
    assert.equal(hiddenSelector.selectorExistence.matchCount, 1);
    assert.equal(hiddenSelector.selectorExistence.visibleMatchCount, 0);
    const positionalTarget = inspectActivePage({ targetSelector: "div:nth-child(2)" });
    assert.equal(positionalTarget.target.fragileSelector, true);
    assert.equal(fetchCalled, false);
  } finally {
    restorePage();
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
  }
});

test("keeps rendered text comparisons normalized and excludes hidden nested matches", () => {
  const text = makeElement("span", "  ISSUE\n created ");
  const button = makeElement("button", "  ISSUE\n created ", [text]);
  const hidden = makeElement("div", "private marker", [], { visible: false });
  const body = makeElement("body", "Issue created", [button, hidden]);
  const restorePage = installMockPage({ body });

  try {
    const observed = inspectActivePage({
      requiredText: "issue created",
      forbiddenText: "private marker",
    });
    assert.equal(observed.requiredTextFound, true);
    assert.equal(observed.forbiddenTextFound, false);
    assert.equal(observed.matchingElementCount, 1);
    assert.equal(observed.matchingElementSamples[0]?.tag, "span");
  } finally {
    restorePage();
  }
});

test("checks URL contains literally and exact URL/title without case or whitespace normalization", () => {
  const input = {
    ...baseInput,
    expectedUrl: "https://github.com/example/repo/issues",
    expectedPageTitle: "repository · Issues",
  };
  const withQuery = pageSnapshot({
    pageUrl: "https://github.com/example/repo/issues?state=open",
  });

  const containsResult = evaluateVerification({ ...input, urlMatchMode: "contains" }, withQuery);
  const exactResult = evaluateVerification({ ...input, urlMatchMode: "exact" }, withQuery);

  assert.equal(containsResult.checks.find(check => check.name === "URL")?.status, "PASS");
  assert.equal(exactResult.checks.find(check => check.name === "URL")?.status, "FAIL");
  assert.equal(exactResult.checks.find(check => check.name === "Exact Page Title")?.status, "FAIL");
  assert.equal(exactResult.checks.find(check => check.name === "Exact Page Title")?.observed, '"Repository · Issues"');
});

test("verifies a specific action using a visible control, its text, and a raw href value", () => {
  const input: VerificationInput = {
    ...baseInput,
    requiredText: "",
    expectedPageTitle: "",
    minimumMatchingElements: null,
    selectorExists: 'button[data-testid="create-issue"]',
    selectorTextSelector: 'button[data-testid="create-issue"]',
    selectorText: "Issue #123 created",
    attributeSelector: 'a[data-testid="created-issue"]',
    attributeName: "href",
    attributeValue: "/issues/123",
    attributeMatchMode: "contains",
  };
  const result = evaluateVerification(input, pageSnapshot({
    selectorExistence: {
      selector: input.selectorExists,
      error: "",
      matchCount: 1,
      visibleMatchCount: 1,
      visibleSamples: [{ tag: "button", text: "Issue #123 created" }],
    },
    selectorText: {
      selector: input.selectorTextSelector,
      error: "",
      matchCount: 1,
      visibleMatchCount: 1,
      matchingVisibleCount: 1,
      visibleSamples: [{ tag: "button", text: "Issue #123 created" }],
      matchingSamples: [{ tag: "button", text: "Issue #123 created" }],
    },
    attributeValue: {
      selector: input.attributeSelector,
      error: "",
      matchCount: 1,
      visibleMatchCount: 1,
      attributeName: "href",
      matchingVisibleCount: 1,
      valueSamples: [{ tag: "a", text: "View issue", value: "/issues/123" }],
      matchingSamples: [{ tag: "a", text: "View issue", value: "/issues/123" }],
    },
  }));

  assert.equal(result.verdict, "PASS");
  assert.equal(result.checks.find(check => check.name === "CSS Selector Exists")?.status, "PASS");
  assert.equal(result.checks.find(check => check.name === "CSS Selector Text")?.status, "PASS");
  const attributeCheck = result.checks.find(check => check.name === "Attribute / Value");
  assert.equal(attributeCheck?.status, "PASS");
  assert.match(attributeCheck?.evidence ?? "", /getAttribute/);
  assert.ok(result.checks.every(check => ["PASS", "FAIL", "SKIPPED", "UNVERIFIED"].includes(check.status)));
});

test("fails selector checks for hidden-only elements and reports invalid CSS selectors explicitly", () => {
  const input: VerificationInput = {
    ...baseInput,
    requiredText: "",
    expectedPageTitle: "",
    minimumMatchingElements: null,
    selectorExists: "#hidden",
    selectorTextSelector: "#hidden",
    selectorText: "success",
  };
  const result = evaluateVerification(input, pageSnapshot({
    selectorExistence: {
      selector: "#hidden",
      error: "",
      matchCount: 1,
      visibleMatchCount: 0,
      visibleSamples: [],
    },
    selectorText: {
      selector: "#hidden",
      error: "",
      matchCount: 1,
      visibleMatchCount: 0,
      matchingVisibleCount: 0,
      visibleSamples: [],
      matchingSamples: [],
    },
  }));

  assert.equal(result.checks.find(check => check.name === "CSS Selector Exists")?.status, "FAIL");
  assert.equal(result.checks.find(check => check.name === "CSS Selector Text")?.status, "FAIL");

  const invalid = evaluateVerification(
    { ...input, selectorTextSelector: "", selectorText: "", selectorExists: "[" },
    pageSnapshot({
      selectorExistence: {
        selector: "[",
        error: "Invalid selector",
        matchCount: 0,
        visibleMatchCount: 0,
        visibleSamples: [],
      },
    }),
  );
  const invalidCheck = invalid.checks.find(check => check.name === "CSS Selector Exists");
  assert.equal(invalidCheck?.status, "UNVERIFIED");
  assert.match(invalidCheck?.evidence ?? "", /rejected CSS selector/);
  assert.equal(invalid.verdict, "UNVERIFIED");
});

test("fails when required text is absent, forbidden text is present, or minimum count is too low", () => {
  const result = evaluateVerification(
    {
      ...baseInput,
      forbiddenText: "permission denied",
      minimumMatchingElements: 2,
    },
    pageSnapshot({
      requiredTextFound: false,
      requiredTextExcerpt: "",
      forbiddenTextFound: true,
      forbiddenTextExcerpt: "The page says permission denied",
      matchingElementCount: 0,
      matchingElementSamples: [],
    }),
  );

  assert.equal(result.verdict, "FAIL");
  assert.equal(result.checks.find(check => check.name === "Required Text")?.status, "FAIL");
  assert.equal(result.checks.find(check => check.name === "Forbidden Text")?.status, "FAIL");
  assert.equal(result.checks.find(check => check.name === "Minimum Matching Visible Elements")?.status, "FAIL");
});

test("keeps unavailable configured checks UNVERIFIED and unconfigured checks SKIPPED", () => {
  const unavailable = createUnavailableResult(
    { ...baseInput, forbiddenText: "permission denied" },
    "Chrome blocked script injection on this page",
  );

  assert.equal(unavailable.verdict, "UNVERIFIED");
  assert.equal(unavailable.checks.length, 9);
  assert.equal(unavailable.checks.find(check => check.name === "Required Text")?.status, "UNVERIFIED");
  assert.equal(unavailable.checks.find(check => check.name === "CSS Selector Exists")?.status, "SKIPPED");
  assert.ok(unavailable.checks.filter(check => check.status === "UNVERIFIED").every(check => /No page content was observed/.test(check.evidence)));
  assert.ok(unavailable.checks.filter(check => check.status === "SKIPPED").every(check => /not configured|No .* configured/.test(check.evidence)));
});

test("returns SKIPPED when every check is intentionally unconfigured", () => {
  const input = {
    ...baseInput,
    expectedUrl: "",
    targetSelector: "",
    requiredText: "",
    forbiddenText: "",
    expectedPageTitle: "",
    minimumMatchingElements: null,
  };
  const result = evaluateVerification(input, pageSnapshot({
    requiredTextFound: null,
    forbiddenTextFound: null,
  }));
  assert.equal(result.verdict, "SKIPPED");
  assert.ok(result.checks.every(check => check.status === "SKIPPED"));
});

test("returns UNVERIFIED when a passing check coexists with insufficient evidence", () => {
  const result = evaluateVerification(
    { ...baseInput, expectedUrl: "https://github.com/example/repo/issues" },
    pageSnapshot({ requiredTextFound: null }),
  );

  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.checks.find(check => check.name === "URL")?.status, "PASS");
  assert.equal(result.checks.find(check => check.name === "Required Text")?.status, "UNVERIFIED");
});

test("an observed failure remains FAIL even when another configured check is UNVERIFIED", () => {
  const result = evaluateVerification(
    { ...baseInput, forbiddenText: "permission denied" },
    pageSnapshot({
      requiredTextFound: null,
      forbiddenTextFound: true,
      forbiddenTextExcerpt: "permission denied",
    }),
  );

  assert.equal(result.verdict, "FAIL");
  assert.equal(result.checks.find(check => check.name === "Required Text")?.status, "UNVERIFIED");
  assert.equal(result.checks.find(check => check.name === "Forbidden Text")?.status, "FAIL");
});