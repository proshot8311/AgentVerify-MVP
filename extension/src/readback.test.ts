import assert from "node:assert/strict";
import { test } from "node:test";
import type { PageSnapshot } from "./content.ts";
import { verifyWithReadback, type VerificationInput } from "./verifier.ts";

const input: VerificationInput = {
  agentClaim: "The task was created.",
  targetSelector: "#task-result",
  pollIntervalMs: 100,
  timeoutMs: 1000,
  expectedUrl: "",
  urlMatchMode: "contains",
  requiredText: "Task created",
  forbiddenText: "",
  expectedPageTitle: "",
  minimumMatchingElements: null,
  selectorExists: "",
  selectorTextSelector: "",
  selectorText: "",
  attributeSelector: "",
  attributeName: "",
  attributeValue: "",
  attributeMatchMode: "contains",
};

function snapshot(
  requiredTextFound: boolean | null,
  target: Partial<PageSnapshot["target"]> = {},
): PageSnapshot {
  return {
    pageUrl: "https://example.test/tasks",
    pageTitle: "Tasks",
    bodyAvailable: requiredTextFound !== null,
    renderedBodyTextLength: 30,
    requiredTextFound,
    requiredTextExcerpt: requiredTextFound ? "Task created" : "",
    forbiddenTextFound: null,
    forbiddenTextExcerpt: "",
    matchingElementCount: requiredTextFound ? 1 : 0,
    matchingElementSamples: requiredTextFound ? [{ tag: "p", text: "Task created" }] : [],
    selectorExistence: {
      selector: "",
      error: "",
      matchCount: 0,
      visibleMatchCount: 0,
      visibleSamples: [],
    },
    selectorText: {
      selector: "",
      error: "",
      matchCount: 0,
      visibleMatchCount: 0,
      visibleSamples: [],
      matchingVisibleCount: 0,
      matchingSamples: [],
    },
    attributeValue: {
      selector: "",
      error: "",
      matchCount: 0,
      visibleMatchCount: 0,
      attributeName: "",
      matchingVisibleCount: 0,
      valueSamples: [],
      matchingSamples: [],
    },
    target: {
      selector: input.targetSelector,
      error: "",
      matchCount: 1,
      visibleMatchCount: 1,
      visibleSamples: [{ tag: "div", text: "Task created" }],
      identity: "#task-result",
      fragileSelector: false,
      ...target,
    },
  };
}

function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    wait: async (milliseconds: number) => { time += milliseconds; },
    advance: (milliseconds: number) => { time += milliseconds; },
  };
}

test("returns PASS after two consecutive observations of a stable target and condition", async () => {
  const clock = fakeClock();
  let observations = 0;
  const result = await verifyWithReadback(
    input,
    async () => {
      observations += 1;
      return snapshot(true);
    },
    clock,
  );

  assert.equal(result.verdict, "PASS");
  assert.equal(observations, 2);
  assert.equal(result.readback.observationCount, 2);
  assert.equal(result.readback.settled, true);
  assert.equal(result.readback.targetIdentity, "#task-result");
  assert.match(result.checks.find(check => check.name === "Required Text")?.evidence ?? "", /Observations: 2/);
});

test("returns FAIL after the required condition is consistently absent", async () => {
  const clock = fakeClock();
  const result = await verifyWithReadback(input, async () => snapshot(false), clock);

  assert.equal(result.verdict, "FAIL");
  assert.equal(result.readback.observationCount, 2);
  assert.equal(result.checks.find(check => check.name === "Required Text")?.status, "FAIL");
});

test("returns UNVERIFIED when observations keep changing", async () => {
  const clock = fakeClock();
  let index = 0;
  const results = [true, false, true, false];
  const result = await verifyWithReadback(
    { ...input, timeoutMs: 300 },
    async () => snapshot(results[index++ % results.length] ?? false),
    clock,
  );

  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.readback.observationCount, 4);
  assert.equal(result.readback.settled, false);
  assert.match(result.readback.limitation, /did not produce two consecutive consistent observations/);
  assert.ok(result.checks.filter(check => check.status !== "SKIPPED").every(check => check.status === "UNVERIFIED"));
});

test("does not settle while the target text changes despite unchanged check results", async () => {
  const clock = fakeClock();
  let observation = 0;
  const result = await verifyWithReadback(
    { ...input, timeoutMs: 300 },
    async () => {
      observation += 1;
      return snapshot(true, {
        visibleSamples: [{ tag: "div", text: `Task created ${observation}` }],
      });
    },
    clock,
  );

  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.readback.observationCount, 4);
  assert.equal(result.readback.settled, false);
});

test("returns UNVERIFIED when observation work reaches the maximum wait before settling", async () => {
  const clock = fakeClock();
  const result = await verifyWithReadback(
    { ...input, timeoutMs: 150 },
    async () => {
      clock.advance(200);
      return snapshot(true);
    },
    clock,
  );

  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.readback.observationCount, 1);
  assert.match(result.readback.limitation, /maximum wait/);
});

test("rejects invalid, ambiguous, and positional target selectors as UNVERIFIED", async () => {
  const invalid = await verifyWithReadback(input, async () => snapshot(true, { error: "Invalid selector" }), fakeClock());
  const ambiguous = await verifyWithReadback(input, async () => snapshot(true, { matchCount: 2 }), fakeClock());
  const positional = await verifyWithReadback(
    { ...input, targetSelector: ".result:nth-child(2)" },
    async () => snapshot(true, { selector: ".result:nth-child(2)", fragileSelector: true }),
    fakeClock(),
  );

  for (const result of [invalid, ambiguous, positional]) {
    assert.equal(result.verdict, "UNVERIFIED");
    assert.equal(result.readback.observationCount, 1);
    assert.equal(result.readback.settled, false);
  }
  assert.match(ambiguous.readback.limitation, /matched 2 elements/);
  assert.match(positional.readback.limitation, /positional selector/);
});

test("returns UNVERIFIED when DOM evidence is unavailable", async () => {
  const result = await verifyWithReadback(
    input,
    async () => { throw new Error("Chrome blocked script injection"); },
    fakeClock(),
  );

  assert.equal(result.verdict, "UNVERIFIED");
  assert.equal(result.readback.observationCount, 0);
  assert.match(result.readback.limitation, /Chrome blocked script injection/);
  assert.equal(result.checks.find(check => check.name === "Required Text")?.status, "UNVERIFIED");
  assert.ok(result.checks.every(check => check.status === "UNVERIFIED" || check.status === "SKIPPED"));
});
