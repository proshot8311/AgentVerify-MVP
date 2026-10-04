export type Verdict = "VERIFIED" | "PARTIALLY VERIFIED" | "FAILED";
export type CheckStatus = "PASS" | "FAIL" | "UNAVAILABLE";
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
function safeRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value as T[] : [];
  } catch { return []; }
}
export const getContracts = () => safeRead<Contract>(CONTRACTS_KEY);
export const getRuns = () => safeRead<Run>(RUNS_KEY);
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