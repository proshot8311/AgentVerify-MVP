import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { getRuns } from "./store.ts";

const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  },
});

beforeEach(() => storage.clear());

function storedRun(checkStatus: string, verdict: string) {
  return {
    id: `record-${checkStatus}`,
    timestamp: new Date(0).toISOString(),
    contract: {
      id: "contract-1",
      name: "Saved contract",
      targetUrl: "https://example.test",
      requiredText: "Created",
      forbiddenText: "",
      expectedTitle: "",
      minimumElements: null,
      agentClaim: "The item was created.",
      createdAt: new Date(0).toISOString(),
    },
    agentClaim: "The item was created.",
    expectedOutcome: "Page contains Created",
    observedOutcome: "Stored result",
    checks: [{
      name: "Required text",
      status: checkStatus,
      expected: "Contains Created",
      observed: "Unknown",
      evidence: "Stored evidence",
    }],
    verdict,
    source: "url",
  };
}

test("legacy UNAVAILABLE check statuses load as UNVERIFIED, not PASS or FAIL", () => {
  storage.set("agentverify.runs.v1", JSON.stringify([storedRun("UNAVAILABLE", "FAILED")]));

  const [run] = getRuns();

  assert.equal(run?.checks[0]?.status, "UNVERIFIED");
  assert.equal(run?.verdict, "UNVERIFIED");
  assert.match(run?.checks[0]?.evidence ?? "", /treated as UNVERIFIED/);
});

test("unknown saved check statuses are preserved as UNVERIFIED regardless of stored verdict", () => {
  storage.set("agentverify.runs.v1", JSON.stringify([storedRun("FUTURE_STATUS", "VERIFIED")]));

  const [run] = getRuns();

  assert.equal(run?.checks[0]?.status, "UNVERIFIED");
  assert.equal(run?.verdict, "UNVERIFIED");
  assert.match(run?.checks[0]?.evidence ?? "", /Unknown stored status/);
});

test("a consistent legacy VERIFIED record with passing checks remains PASS", () => {
  storage.set("agentverify.runs.v1", JSON.stringify([storedRun("PASS", "VERIFIED")]));

  const [run] = getRuns();

  assert.equal(run?.verdict, "PASS");
});

test("an inconsistent stored verdict does not upgrade a record to PASS", () => {
  storage.set("agentverify.runs.v1", JSON.stringify([storedRun("PASS", "FAILED")]));

  const [run] = getRuns();

  assert.equal(run?.verdict, "UNVERIFIED");
});
