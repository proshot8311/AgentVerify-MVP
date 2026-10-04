import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectActivePage } from "./content.ts";
import type { PageSnapshot } from "./content.ts";
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
  ariaHidden: boolean;
  getClientRects(): Array<object>;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): MockElement[];
}

function makeElement(
  tagName: string,
  text: string,
  children: MockElement[] = [],
  options: { visible?: boolean; ariaHidden?: boolean } = {},
): MockElement {
  const element: MockElement = {
    tagName: tagName.toUpperCase(),
    innerText: text,
    textContent: text,
    children,
    parentElement: null,
    visible: options.visible ?? true,
    ariaHidden: options.ariaHidden ?? false,
    getClientRects() {
      return this.visible ? [{}] : [];
    },
    getAttribute(name: string) {
      return name === "aria-hidden" && this.ariaHidden ? "true" : null;
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

const baseInput: VerificationInput = {
  agentClaim: "The issue was created.",
  requiredText: "Issue created",
  forbiddenText: "",
  expectedPageTitle: "Repository · Issues",
  minimumMatchingElements: 1,
};

function snapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
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
    ...overrides,
  };
}

test("inspects rendered page text and avoids counting nested wrappers twice", () => {
  const text = makeElement("span", "  ISSUE\n created ");
  const button = makeElement("button", "  ISSUE\n created ", [text]);
  const hidden = makeElement("div", "private marker", [], { visible: false });
  const body = makeElement("body", "Issue created", [button, hidden]);
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { href: "https://github.com/example/repo/issues" },
      getComputedStyle: (element: MockElement) => ({
        display: element.visible ? "block" : "none",
        visibility: "visible",
        opacity: "1",
      }),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body, title: "Repository · Issues" },
  });

  try {
    const observed = inspectActivePage({ requiredText: "issue created", forbiddenText: "private marker" });
    assert.equal(observed.requiredTextFound, true);
    assert.equal(observed.forbiddenTextFound, false);
    assert.equal(observed.matchingElementCount, 1);
    assert.equal(observed.matchingElementSamples[0]?.tag, "span");
    assert.equal(observed.pageUrl, "https://github.com/example/repo/issues");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("normalizes casing and whitespace and verifies every configured check", () => {
  const input = {
    ...baseInput,
    requiredText: "  ISSUE  created ",
    expectedPageTitle: " repository ·   ISSUES ",
    minimumMatchingElements: 1,
  };

  const result = evaluateVerification(input, snapshot({
    pageTitle: "Repository · Issues",
    requiredTextExcerpt: "New issue was created",
    matchingElementCount: 2,
    matchingElementSamples: [
      { tag: "span", text: "issue created" },
      { tag: "button", text: "issue created" },
    ],
  }));

  assert.equal(result.verdict, "VERIFIED");
  assert.equal(result.checks.length, 4);
  assert.ok(result.checks.every(check => check.status === "PASS" || check.status === "SKIPPED"));
  assert.match(result.checks[0].evidence, /New issue was created/);
  assert.match(result.checks[3].evidence, /nested matching wrappers are not double-counted/i);
});

test("fails when required evidence is absent, forbidden text is present, or count is too low", () => {
  const result = evaluateVerification(
    {
      ...baseInput,
      forbiddenText: "permission denied",
      minimumMatchingElements: 2,
    },
    snapshot({
      requiredTextFound: false,
      requiredTextExcerpt: "",
      forbiddenTextFound: true,
      forbiddenTextExcerpt: "The page says permission denied",
      matchingElementCount: 0,
      matchingElementSamples: [],
    }),
  );

  assert.equal(result.verdict, "FAILED");
  assert.deepEqual(result.checks.map(check => check.status), ["FAIL", "FAIL", "PASS", "FAIL"]);
  assert.match(result.checks[1].evidence, /permission denied/);
});

test("reports unavailable inspection without inventing page evidence", () => {
  const result = createUnavailableResult(
    { ...baseInput, forbiddenText: "permission denied" },
    "Chrome blocked script injection on this page",
  );

  assert.equal(result.verdict, "FAILED");
  assert.ok(result.checks.every(check => check.status === "NOT CHECKED"));
  assert.ok(result.checks.every(check => /No page content was observed/.test(check.evidence)));
});