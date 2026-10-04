import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createDemoRun } from "./verify.ts";

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

  assert.equal(run.verdict, "VERIFIED");
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

  assert.equal(run.verdict, "FAILED");
  assert.match(run.checks[0].evidence, /task-list-absent/);
  assert.match(run.checks[0].evidence, /Found 0 exact task match/);
});