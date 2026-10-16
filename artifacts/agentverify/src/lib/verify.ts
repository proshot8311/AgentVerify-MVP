import { verdictFromChecks, type Check, type Contract, type Run } from "./store.ts";
import { makeId, saveRun } from "./store.ts";

function check(name: string, pass: boolean, expected: string, observed: string, evidence: string): Check {
  return { name, status: pass ? "PASS" : "FAIL", expected, observed, evidence };
}
export async function verifyContract(contract: Contract): Promise<Run> {
  const checks: Check[] = [];
  let title = "";
  let bodyText = "";
  let elements: Element[] = [];
  let inspectionError = "";
  try {
    const url = new URL(contract.targetUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP and HTTPS target URLs can be inspected.");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url.href, { method: "GET", mode: "cors", credentials: "omit", signal: controller.signal, headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(`Browser fetch returned HTTP ${response.status} ${response.statusText || ""}`.trim());
      const contentType = response.headers.get("content-type") || "";
      const html = await response.text();
      if (contentType && !contentType.includes("text/html")) throw new Error(`Target returned ${contentType}, not text/html.`);
      const document = new DOMParser().parseFromString(html, "text/html");
      title = document.title;
      bodyText = (document.body?.innerText || document.body?.textContent || "").replace(/\s+/g, " ").trim();
      elements = Array.from(document.body?.querySelectorAll("*") || []);
    } finally { window.clearTimeout(timeout); }
  } catch (error) {
    inspectionError = error instanceof Error ? (error.name === "AbortError" ? "Browser fetch timed out after 9 seconds." : error.message) : "Unknown browser fetch error.";
  }
  const configured = [
    !!contract.requiredText.trim(),
    !!contract.forbiddenText.trim(),
    !!contract.expectedTitle.trim(),
    contract.minimumElements !== null,
  ].filter(Boolean).length;
  if (inspectionError) {
    const reason = `Inspection unavailable: ${inspectionError}. Browser fetch could not provide inspectable HTML; no target content was inferred.`;
    if (contract.requiredText.trim()) checks.push({ name: "Required text", status: "UNVERIFIED", expected: `Contains “${contract.requiredText}” (case-insensitive)`, observed: "Unavailable", evidence: reason });
    if (contract.forbiddenText.trim()) checks.push({ name: "Forbidden text", status: "UNVERIFIED", expected: `Does not contain “${contract.forbiddenText}” (case-insensitive)`, observed: "Unavailable", evidence: reason });
    if (contract.expectedTitle.trim()) checks.push({ name: "Page title", status: "UNVERIFIED", expected: `Title equals “${contract.expectedTitle}”`, observed: "Unavailable", evidence: reason });
    if (contract.minimumElements !== null) checks.push({ name: "Minimum matching elements", status: "UNVERIFIED", expected: `At least ${contract.minimumElements} element(s) containing the required text`, observed: "Unavailable", evidence: reason });
  } else {
    const lowerBody = bodyText.toLocaleLowerCase();
    const required = contract.requiredText.trim();
    if (required) {
      const matchingElements = elements.filter(el => (el.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase().includes(required.toLocaleLowerCase()));
      const pass = lowerBody.includes(required.toLocaleLowerCase());
      checks.push(check("Required text", pass, `Contains “${required}” (case-insensitive)`, pass ? `Found in page body (${matchingElements.length} matching element${matchingElements.length === 1 ? "" : "s"})` : "Not found in page body", pass ? `Parsed body text contains the exact phrase “${required}”. ${matchingElements.length} DOM element(s) have text content containing it; nested matching elements are counted individually.` : `Parsed body text inspected (${bodyText.length} characters); exact phrase “${required}” was not present.`));
    }
    const forbidden = contract.forbiddenText.trim();
    if (forbidden) {
      const pass = !lowerBody.includes(forbidden.toLocaleLowerCase());
      checks.push(check("Forbidden text", pass, `Does not contain “${forbidden}” (case-insensitive)`, pass ? "Phrase absent from page body" : "Phrase found in page body", pass ? `Parsed body text inspected (${bodyText.length} characters); forbidden phrase was absent.` : `Parsed body text contains the exact phrase “${forbidden}”.`));
    }
    const expectedTitle = contract.expectedTitle.trim();
    if (expectedTitle) {
      const pass = title.trim().toLocaleLowerCase() === expectedTitle.toLocaleLowerCase();
      checks.push(check("Page title", pass, `Equals “${expectedTitle}” (case-insensitive)`, title ? `“${title}”` : "(empty title)", `document.title parsed from fetched HTML: ${JSON.stringify(title)}.`));
    }
    if (contract.minimumElements !== null) {
      const phrase = required.toLocaleLowerCase();
      const matches = phrase ? elements.filter(el => (el.textContent || "").replace(/\s+/g, " ").trim().toLocaleLowerCase().includes(phrase)).length : elements.length;
      const basis = phrase ? `DOM elements whose text content contains Required Text “${required}”` : "all descendant elements of <body> (Required Text is not configured)";
      const pass = matches >= contract.minimumElements;
      checks.push(check("Minimum matching elements", pass, `At least ${contract.minimumElements} ${phrase ? "element(s) containing Required Text" : "body descendant element(s)"}`, `${matches} matching element(s)`, `Counted ${matches} actual parsed DOM element(s): ${basis}. Nested matches count individually.`));
    }
  }
  if (!configured) checks.push({ name: "HTTP inspection", status: inspectionError ? "UNVERIFIED" : "PASS", expected: "Fetch and parse target HTML", observed: inspectionError ? "Unavailable" : "HTML parsed", evidence: inspectionError ? `Inspection unavailable: ${inspectionError}. No target content was inferred.` : `Fetched ${contract.targetUrl} in this browser and parsed HTML; title ${JSON.stringify(title)}, body text ${bodyText.length} characters.` });
  const passed = checks.filter(item => item.status === "PASS").length;
  const run: Run = {
    id: makeId(), timestamp: new Date().toISOString(), contract, agentClaim: contract.agentClaim,
    expectedOutcome: [
      contract.requiredText && `Page contains “${contract.requiredText}”`,
      contract.forbiddenText && `Page excludes “${contract.forbiddenText}”`,
      contract.expectedTitle && `Page title is “${contract.expectedTitle}”`,
      contract.minimumElements !== null && `At least ${contract.minimumElements} matching elements`,
    ].filter(Boolean).join("; ") || "HTTP(S) page inspection completes successfully.",
    observedOutcome: inspectionError
      ? `Inspection could not be completed: ${inspectionError}. Configured checks without evidence are UNVERIFIED.`
      : `${passed} of ${checks.length} configured check(s) passed. Parsed page title: ${JSON.stringify(title)}.`,
    checks, verdict: verdictFromChecks(checks), source: "url",
  };
  saveRun(run);
  return run;
}

export function normalizeTaskText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function createDemoRun(boardName: string, taskList: HTMLElement): Run {
  const claim = "Task 'Prepare ICSE Board Project' was created.";
  const phrase = "Prepare ICSE Board Project";
  const normalizedPhrase = normalizeTaskText(phrase);
  const taskItems = Array.from(taskList.querySelectorAll<HTMLElement>("[data-task-item]"));
  const matching = taskItems.filter(item => {
    const taskText = item.querySelector("[data-task-text]")?.textContent ?? "";
    return normalizeTaskText(taskText) === normalizedPhrase;
  });
  const pass = matching.length > 0;
  const unique = matching.length === 1;
  const listId = taskList.getAttribute("data-testid") ?? "provided task list";
  const checks: Check[] = [
    check("Required task", pass, `Task list contains exact task “${phrase}” (case and whitespace normalized)`, pass ? `Found ${matching.length} matching task item(s)` : "Task item not found", `Queried rendered ${boardName} list ${JSON.stringify(listId)} for [data-task-item] entries and compared each nested [data-task-text] value after whitespace and casing normalization. Found ${matching.length} exact task match(es).`),
    check("Task item is unique", unique, "Exactly 1 matching task item", `${matching.length} matching task item(s)`, `Counted normalized exact-text matches inside rendered list ${JSON.stringify(listId)}.`),
  ];
  const run: Run = {
    id: makeId(), timestamp: new Date().toISOString(),
    contract: { id: `demo-${boardName.toLowerCase().replace(/\W+/g, "-")}`, name: `${boardName} task creation`, targetUrl: "local demo board", requiredText: phrase, forbiddenText: "", expectedTitle: boardName, minimumElements: 1, agentClaim: claim, createdAt: new Date().toISOString() },
    agentClaim: claim, expectedOutcome: `Rendered task list contains “${phrase}”.`,
    observedOutcome: pass ? `Rendered task list contains ${matching.length} exact matching task item(s).` : `Rendered task list contains no exact matching task item.`,
    checks, verdict: verdictFromChecks(checks), source: "demo",
  };
  saveRun(run);
  return run;
}