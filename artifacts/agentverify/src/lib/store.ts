export type Verdict = "PASS" | "FAIL" | "UNVERIFIED" | "SKIPPED";
export type CheckStatus = Verdict;
export type Check = {
  name: string;
  status: CheckStatus;
  expected: string;
  observed: string;
  evidence: string;
};
export type Contract = {
  id: string;
  name: string;
  targetUrl: string;
  requiredText: string;
  forbiddenText: string;
  expectedTitle: string;
  minimumElements: number | null;
  agentClaim: string;
  createdAt: string;
};
export type Run = {
  id: string;
  timestamp: string;
  contract: Contract;
  agentClaim: string;
  expectedOutcome: string;
  observedOutcome: string;
  checks: Check[];
  verdict: Verdict;
  source: "url" | "demo";
};

const CONTRACTS_KEY = "agentverify.contracts.v1";
const RUNS_KEY = "agentverify.runs.v1";

export function verdictFromChecks(checks: readonly { status: string }[]): Verdict {
  if (checks.length === 0) return "UNVERIFIED";
  if (checks.some(check => check.status === "FAIL")) return "FAIL";
  if (checks.some(check => check.status === "UNVERIFIED")) return "UNVERIFIED";
  const requiredChecks = checks.filter(check => check.status !== "SKIPPED");
  if (requiredChecks.length === 0) return "SKIPPED";
  return requiredChecks.every(check => check.status === "PASS") ? "PASS" : "UNVERIFIED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isContract(value: unknown): value is Contract {
  return isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.targetUrl === "string" &&
    typeof value.requiredText === "string" &&
    typeof value.forbiddenText === "string" &&
    typeof value.expectedTitle === "string" &&
    (value.minimumElements === null || typeof value.minimumElements === "number") &&
    typeof value.agentClaim === "string" &&
    typeof value.createdAt === "string";
}

function readStoredArray(key: string): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
    console.warn(`AgentVerify ignored invalid stored data for ${key}: expected an array.`);
  } catch (error) {
    console.warn(`AgentVerify could not read stored data for ${key}.`, error);
  }
  return [];
}

function normalizeCheck(value: unknown, index: number): Check {
  const raw = isRecord(value) ? value : {};
  const rawStatus = raw.status;
  let status: CheckStatus;
  let statusNote = "";
  if (rawStatus === "PASS" || rawStatus === "FAIL" || rawStatus === "UNVERIFIED" || rawStatus === "SKIPPED") {
    status = rawStatus;
  } else if (rawStatus === "UNAVAILABLE") {
    status = "UNVERIFIED";
    statusNote = " Legacy UNAVAILABLE evidence is treated as UNVERIFIED.";
  } else {
    status = "UNVERIFIED";
    statusNote = ` Unknown stored status ${JSON.stringify(rawStatus)} is treated as UNVERIFIED.`;
  }
  return {
    name: typeof raw.name === "string" ? raw.name : `Stored check ${index + 1}`,
    status,
    expected: typeof raw.expected === "string" ? raw.expected : "",
    observed: typeof raw.observed === "string" ? raw.observed : "Unknown",
    evidence: `${typeof raw.evidence === "string" ? raw.evidence : "Stored evidence is missing."}${statusNote}`,
  };
}

function normalizeRun(value: unknown): Run | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.timestamp !== "string" || !isContract(value.contract)) {
    return null;
  }
  const checks: Check[] = Array.isArray(value.checks)
    ? value.checks.map(normalizeCheck)
    : [{
        name: "Stored verification record",
        status: "UNVERIFIED",
        expected: "A valid set of saved checks",
        observed: "Checks are missing or invalid",
        evidence: "The saved record has no readable checks; its verdict cannot be verified.",
      }];
  if (checks.length === 0) {
    checks.push({
      name: "Stored verification record",
      status: "UNVERIFIED",
      expected: "At least one evaluated check",
      observed: "No checks were saved",
      evidence: "The saved record contains no checks; its verdict cannot be verified.",
    });
  }
  const evidenceVerdict = verdictFromChecks(checks);
  const storedVerdict = value.verdict;
  const verdict = evidenceVerdict === "PASS" &&
      storedVerdict !== "PASS" && storedVerdict !== "VERIFIED"
    ? "UNVERIFIED"
    : evidenceVerdict;
  return {
    id: value.id,
    timestamp: value.timestamp,
    contract: value.contract,
    agentClaim: typeof value.agentClaim === "string" ? value.agentClaim : value.contract.agentClaim,
    expectedOutcome: typeof value.expectedOutcome === "string" ? value.expectedOutcome : "",
    observedOutcome: typeof value.observedOutcome === "string" ? value.observedOutcome : "Stored outcome is unavailable.",
    checks,
    verdict,
    source: value.source === "demo" ? "demo" : "url",
  };
}

export const getContracts = () => readStoredArray(CONTRACTS_KEY).filter(isContract);
export function getRuns(): Run[] {
  return readStoredArray(RUNS_KEY).flatMap((value, index) => {
    const run = normalizeRun(value);
    if (!run) {
      console.warn(`AgentVerify ignored invalid saved run at index ${index}.`);
      return [];
    }
    return [run];
  });
}
export function saveContract(contract: Contract) {
  const records = getContracts().filter(item => item.id !== contract.id);
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify([contract, ...records]));
}
export function saveRun(run: Run) {
  localStorage.setItem(RUNS_KEY, JSON.stringify([run, ...getRuns().filter(item => item.id !== run.id)]));
}
export function getRun(id: string) { return getRuns().find(run => run.id === id); }
export function makeId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
export function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}