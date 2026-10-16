import { inspectActivePage, type PageInspectionRequest, type PageSnapshot } from "./content.js";
import {
  createUnavailableResult,
  evaluateVerification,
  type VerificationCheck,
  type VerificationInput,
  type VerificationResult,
} from "./verifier.js";

interface ActiveTab {
  id?: number;
}

interface ChromeApi {
  tabs: {
    query(query: { active: true; currentWindow: true }): Promise<ActiveTab[]>;
  };
  scripting: {
    executeScript(result: {
      target: { tabId: number };
      func: (request: PageInspectionRequest) => PageSnapshot;
      args: [PageInspectionRequest];
    }): Promise<Array<{ result?: PageSnapshot }>>;
  };
}

declare const chrome: ChromeApi;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`AgentVerify popup is missing ${selector}.`);
  return element;
}

const form = requireElement<HTMLFormElement>("#verify-form");
const resultRegion = requireElement<HTMLElement>("#result");
const formError = requireElement<HTMLElement>("#form-error");
const verifyButton = requireElement<HTMLButtonElement>("#verify-button");

function rawFieldValue(name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
    ? field.value
    : "";
}

function fieldValue(name: string): string {
  return rawFieldValue(name).trim();
}

function collectInput(): VerificationInput {
  const urlMatchMode = fieldValue("urlMatchMode");
  if (urlMatchMode !== "contains" && urlMatchMode !== "exact") {
    throw new Error("Choose Contains or Exact URL for the URL check.");
  }

  const attributeMatchMode = fieldValue("attributeMatchMode");
  if (attributeMatchMode !== "contains" && attributeMatchMode !== "exact") {
    throw new Error("Choose Contains or Exact value for the attribute check.");
  }

  const requiredText = fieldValue("requiredText");
  const minimumRaw = fieldValue("minimumMatchingElements");
  let minimumMatchingElements: number | null = null;
  if (minimumRaw) {
    const minimumValue = Number(minimumRaw);
    if (!Number.isInteger(minimumValue) || minimumValue < 1 || minimumValue > 10000) {
      throw new Error("Minimum Matching Elements must be a whole number from 1 to 10,000.");
    }
    if (!requiredText) {
      throw new Error("Enter Required Text to define which elements the minimum count should match.");
    }
    minimumMatchingElements = minimumValue;
  }

  const selectorTextSelector = fieldValue("selectorTextSelector");
  const selectorText = fieldValue("selectorText");
  if (Boolean(selectorTextSelector) !== Boolean(selectorText)) {
    throw new Error("For CSS Selector Text, enter both a selector and the text to find.");
  }

  const attributeSelector = fieldValue("attributeSelector");
  const attributeName = fieldValue("attributeName");
  const attributeValue = rawFieldValue("attributeValue");
  const hasAttributeCheck = Boolean(attributeSelector || attributeName || attributeValue);
  if (
    hasAttributeCheck &&
    (!attributeSelector || !attributeName || attributeValue.length === 0)
  ) {
    throw new Error("For Attribute / Value, enter a selector, attribute name, and expected value.");
  }
  if (attributeName && !/^[A-Za-z_:][A-Za-z0-9:._-]*$/.test(attributeName)) {
    throw new Error("Enter a valid attribute name, such as href, aria-label, or data-state.");
  }

  const input: VerificationInput = {
    agentClaim: fieldValue("agentClaim"),
    expectedUrl: fieldValue("expectedUrl"),
    urlMatchMode,
    requiredText,
    forbiddenText: fieldValue("forbiddenText"),
    expectedPageTitle: rawFieldValue("expectedPageTitle"),
    minimumMatchingElements,
    selectorExists: fieldValue("selectorExists"),
    selectorTextSelector,
    selectorText,
    attributeSelector,
    attributeName,
    attributeValue,
    attributeMatchMode,
  };

  const hasConfiguredCheck = Boolean(
    input.expectedUrl ||
      input.requiredText ||
      input.forbiddenText ||
      input.expectedPageTitle.trim() ||
      input.minimumMatchingElements !== null ||
      input.selectorExists ||
      input.selectorTextSelector ||
      input.attributeSelector,
  );
  if (!hasConfiguredCheck) throw new Error("Configure at least one contract check.");
  if (!input.agentClaim) throw new Error("Enter the Agent Claim.");

  return input;
}

function createText(parent: HTMLElement, tag: "p" | "strong" | "span" | "h2", className: string, text: string): HTMLElement {
  const child = document.createElement(tag);
  child.className = className;
  child.textContent = text;
  parent.append(child);
  return child;
}

function renderCheck(check: VerificationCheck): HTMLElement {
  const card = document.createElement("article");
  card.className = "check";

  const heading = document.createElement("div");
  heading.className = "check-heading";
  createText(heading, "span", "", check.name);
  createText(heading, "span", `check-status ${check.status.toLowerCase()}`, check.status);
  card.append(heading);

  createText(card, "p", "", `Expected: ${check.expected}`);
  createText(card, "p", "", `Observed: ${check.observed}`);
  const evidence = createText(card, "p", "", "");
  const label = document.createElement("strong");
  label.textContent = "Evidence: ";
  evidence.append(label, document.createTextNode(check.evidence));
  return card;
}

function renderResult(input: VerificationInput, result: VerificationResult): void {
  resultRegion.replaceChildren();
  resultRegion.hidden = false;

  const top = document.createElement("div");
  top.className = "result-top";
  const verdictClass = result.verdict === "PASS"
    ? "pass"
    : result.verdict === "FAIL"
      ? "fail"
      : result.verdict === "UNVERIFIED"
        ? "unverified"
        : "skipped";
  const verdict = createText(
    top,
    "h2",
    `verdict ${verdictClass}`,
    result.verdict,
  );
  verdict.setAttribute("aria-label", `Verdict: ${result.verdict}`);
  resultRegion.append(top);

  createText(
    resultRegion,
    "p",
    "result-page",
    result.pageUrl || (result.unavailableReason ? "Active tab could not be inspected." : "Page URL unavailable."),
  );

  const claim = document.createElement("p");
  claim.className = "claim-context";
  const claimLabel = document.createElement("strong");
  claimLabel.textContent = "Agent Claim · context only";
  claim.append(claimLabel, document.createTextNode(input.agentClaim));
  resultRegion.append(claim);

  if (result.unavailableReason) {
    createText(
      resultRegion,
      "p",
      "form-error",
      `Inspection unavailable: ${result.unavailableReason}. Checks without evidence are UNVERIFIED; no conclusion was inferred.`,
    );
  }

  const checks = document.createElement("div");
  checks.className = "check-list";
  for (const item of result.checks) checks.append(renderCheck(item));
  resultRegion.append(checks);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  formError.hidden = true;
  formError.textContent = "";
  resultRegion.hidden = true;
  resultRegion.replaceChildren();

  let input: VerificationInput;
  try {
    input = collectInput();
  } catch (error) {
    formError.textContent = error instanceof Error ? error.message : "Check the verification fields.";
    formError.hidden = false;
    return;
  }

  verifyButton.disabled = true;
  verifyButton.textContent = "Inspecting active tab…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number") throw new Error("Chrome did not provide an active tab ID.");

    const request: PageInspectionRequest = {
      requiredText: input.requiredText,
      forbiddenText: input.forbiddenText,
      selectorExists: input.selectorExists,
      selectorTextSelector: input.selectorTextSelector,
      selectorText: input.selectorText,
      attributeSelector: input.attributeSelector,
      attributeName: input.attributeName,
      attributeValue: input.attributeValue,
      attributeMatchMode: input.attributeMatchMode,
    };
    const executions = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: inspectActivePage,
      args: [request],
    });
    const snapshot = executions[0]?.result;
    if (!snapshot) throw new Error("The active tab returned no DOM inspection result.");

    renderResult(input, evaluateVerification(input, snapshot));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Chrome did not allow inspection of this tab.";
    renderResult(input, createUnavailableResult(input, reason));
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify Current Page";
  }
});