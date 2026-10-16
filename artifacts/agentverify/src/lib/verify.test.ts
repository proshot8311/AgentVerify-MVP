import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createDemoRun, verifyContract } from "./verify.ts";
import { verdictFromChecks, type Check, type Contract } from "./store.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});

beforeEach(() => storage.clear());

function renderedTaskList(
  testId: string,
  taskTitles: string[][],
): HTMLElement {
  const taskItems = taskTitles.map(parts => {
    const title = { textContent: parts.join("") };
    return {
      textContent: `${title.textContent ?? ""}OPEN`,
      querySelector: (selector: string) =>
        selector === "[data-task-text]" ? title : null,
    };
  });

  return {
    getAttribute: (name: string) => name === "data-testid" ? testId : null,
    querySelectorAll: (selector: string) =>
      selector === "[data-task-item]" ? taskItems : [],
  } as unknown as HTMLElement;
}

test("Target A is VERIFIED from its rendered, nested task text", () => {
  const targetA = renderedTaskList("task-list-present", [
    ["  pRePaRe ", "ICSE\n", " Board   PROJECT  "],
    ["Review sprint backlog"],
  ]);

  const run = createDemoRun("Northstar Tasks", targetA);

  assert.equal(run.verdict, "PASS");
  assert.match(run.checks[0].evidence, /task-list-present/);
  assert.match(run.checks[0].evidence, /Found 1 exact task match/);
});

test("Target B is FAILED when its rendered task list lacks the task", () => {
  const targetB = renderedTaskList("task-list-absent", [
    ["Review sprint backlog"],
    ["Update release notes"],
    ["Confirm design handoff"],
  ]);

  const run = createDemoRun("Fieldnotes Tasks", targetB);

  assert.equal(run.verdict, "FAIL");
  assert.match(run.checks[0].evidence, /task-list-absent/);
  assert.match(run.checks[0].evidence, /Found 0 exact task match/);
});

test("one passing check and one unverified check aggregate to UNVERIFIED", () => {
  const checks: Check[] = [
    { name: "Observed", status: "PASS", expected: "", observed: "", evidence: "Observed." },
    { name: "Unavailable", status: "UNVERIFIED", expected: "", observed: "Unavailable", evidence: "No evidence." },
  ];
  assert.equal(verdictFromChecks(checks), "UNVERIFIED");
});

test("a definitive failure takes precedence over an unverified check", () => {
  const checks: Check[] = [
    { name: "Failed", status: "FAIL", expected: "", observed: "", evidence: "Observed mismatch." },
    { name: "Unavailable", status: "UNVERIFIED", expected: "", observed: "Unavailable", evidence: "No evidence." },
  ];
  assert.equal(verdictFromChecks(checks), "FAIL");
});

test("all required passing checks aggregate to PASS while skipped checks do not affect the result", () => {
  const checks: Check[] = [
    { name: "Observed A", status: "PASS", expected: "", observed: "", evidence: "Observed." },
    { name: "Not configured", status: "SKIPPED", expected: "", observed: "", evidence: "Not applicable." },
    { name: "Observed B", status: "PASS", expected: "", observed: "", evidence: "Observed." },
  ];
  assert.equal(verdictFromChecks(checks), "PASS");
  assert.equal(verdictFromChecks([checks[1]!]), "SKIPPED");
});

test("an unknown check status cannot be aggregated as PASS", () => {
  assert.equal(verdictFromChecks([{ status: "UNKNOWN" }]), "UNVERIFIED");
});

test("unavailable fetch evidence is UNVERIFIED, not a failed assertion or success", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { setTimeout: () => 1, clearTimeout: () => undefined },
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: async () => { throw new Error("CORS blocked"); },
  });
  const contract: Contract = {
    id: "unavailable-contract",
    name: "Unavailable evidence",
    targetUrl: "https://example.test",
    requiredText: "Created",
    forbiddenText: "",
    expectedTitle: "",
    minimumElements: null,
    agentClaim: "The item was created.",
    createdAt: new Date(0).toISOString(),
  };

  try {
    const run = await verifyContract(contract);
    assert.equal(run.verdict, "UNVERIFIED");
    assert.equal(run.checks[0]?.status, "UNVERIFIED");
    assert.match(run.checks[0]?.evidence ?? "", /no target content was inferred/i);
    assert.doesNotMatch(run.checks[0]?.evidence ?? "", /assertion failed/i);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalFetch) Object.defineProperty(globalThis, "fetch", originalFetch);
    else Reflect.deleteProperty(globalThis, "fetch");
  }
});