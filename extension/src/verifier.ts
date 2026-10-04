import type { PageSnapshot } from "./content.js";

export interface VerificationInput {
  agentClaim: string;
  requiredText: string;
  forbiddenText: string;
  expectedPageTitle: string;
  minimumMatchingElements: number;
}

export type CheckStatus = "PASS" | "FAIL" | "SKIPPED" | "NOT CHECKED";

export interface VerificationCheck {
  name: string;
  status: CheckStatus;
  expected: string;
  observed: string;
  evidence: string;
}

export interface VerificationResult {
  verdict: "VERIFIED" | "FAILED";
  pageUrl: string;
  pageTitle: string;
  unavailableReason: string;
  checks: VerificationCheck[];
}

export function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function skippedCheck(name: string, reason: string): VerificationCheck {
  return {
    name,
    status: "SKIPPED",
    expected: "Optional check not configured",
    observed: "Skipped",
    evidence: reason,
  };
}

function unavailableCheck(name: string, expected: string, reason: string): VerificationCheck {
  return {
    name,
    status: "NOT CHECKED",
    expected,
    observed: "Active-tab DOM was not inspected",
    evidence: `Inspection unavailable: ${reason}. No page content was observed and no conclusion about this check was inferred.`,
  };
}

export function createUnavailableResult(
  input: VerificationInput,
  reason: string,
): VerificationResult {
  const checks: VerificationCheck[] = [
    unavailableCheck("Required Text", `Rendered page contains “${input.requiredText}”`, reason),
    input.forbiddenText.trim()
      ? unavailableCheck("Forbidden Text", `Rendered page does not contain “${input.forbiddenText}”`, reason)
      : skippedCheck("Forbidden Text", "No forbidden text was provided; no absence claim is made."),
    input.expectedPageTitle.trim()
      ? unavailableCheck("Page Title", `Title matches “${input.expectedPageTitle}”`, reason)
      : skippedCheck("Page Title", "No expected page title was provided; no title claim is made."),
    unavailableCheck(
      "Minimum Matching Elements",
      `At least ${input.minimumMatchingElements} visible matching element(s)`,
      reason,
    ),
  ];
  return { verdict: "FAILED", pageUrl: "", pageTitle: "", unavailableReason: reason, checks };
}

export function evaluateVerification(
  input: VerificationInput,
  snapshot: PageSnapshot,
): VerificationResult {
  const checks: VerificationCheck[] = [];
  const unavailable = "The active tab did not expose a document body.";

  if (!snapshot.bodyAvailable) {
    checks.push(unavailableCheck("Required Text", `Rendered page contains “${input.requiredText}”`, unavailable));
  } else {
    const passed = snapshot.requiredTextFound;
    checks.push({
      name: "Required Text",
      status: passed ? "PASS" : "FAIL",
      expected: `Rendered page contains “${input.requiredText}” (case and whitespace normalized)`,
      observed: passed ? "Required text found" : "Required text not found",
      evidence: passed
        ? `Inspected ${snapshot.renderedBodyTextLength} characters of rendered body text. Match context: ${JSON.stringify(snapshot.requiredTextExcerpt)}.`
        : `Inspected ${snapshot.renderedBodyTextLength} characters of rendered body text; the normalized phrase was absent.`,
    });
  }

  if (!input.forbiddenText.trim()) {
    checks.push(skippedCheck("Forbidden Text", "No forbidden text was provided; no absence claim is made."));
  } else if (!snapshot.bodyAvailable) {
    checks.push(unavailableCheck("Forbidden Text", `Rendered page does not contain “${input.forbiddenText}”`, unavailable));
  } else {
    const found = snapshot.forbiddenTextFound === true;
    checks.push({
      name: "Forbidden Text",
      status: found ? "FAIL" : "PASS",
      expected: `Rendered page does not contain “${input.forbiddenText}” (case and whitespace normalized)`,
      observed: found ? "Forbidden text found" : "Forbidden text not found",
      evidence: found
        ? `Inspected ${snapshot.renderedBodyTextLength} characters of rendered body text. Match context: ${JSON.stringify(snapshot.forbiddenTextExcerpt)}.`
        : `Inspected ${snapshot.renderedBodyTextLength} characters of rendered body text; the normalized forbidden phrase was absent.`,
    });
  }

  if (!input.expectedPageTitle.trim()) {
    checks.push(skippedCheck("Page Title", "No expected page title was provided; no title claim is made."));
  } else {
    const passed =
      normalizeForComparison(snapshot.pageTitle) ===
      normalizeForComparison(input.expectedPageTitle);
    checks.push({
      name: "Page Title",
      status: passed ? "PASS" : "FAIL",
      expected: `“${input.expectedPageTitle}” (case and whitespace normalized)`,
      observed: JSON.stringify(snapshot.pageTitle),
      evidence: `Read document.title directly from the active tab: ${JSON.stringify(snapshot.pageTitle)}.`,
    });
  }

  if (!snapshot.bodyAvailable) {
    checks.push(
      unavailableCheck(
        "Minimum Matching Elements",
        `At least ${input.minimumMatchingElements} visible matching element(s)`,
        unavailable,
      ),
    );
  } else {
    const count = snapshot.matchingElementCount;
    const passed = count >= input.minimumMatchingElements;
    const examples = snapshot.matchingElementSamples
      .map(sample => `<${sample.tag}> ${JSON.stringify(sample.text)}`)
      .join("; ");
    checks.push({
      name: "Minimum Matching Elements",
      status: passed ? "PASS" : "FAIL",
      expected: `At least ${input.minimumMatchingElements} visible, most-specific element(s) containing Required Text`,
      observed: `${count} matching element(s)`,
      evidence: `Counted ${count} visible, most-specific DOM element(s) whose rendered text contains the normalized Required Text. Nested matching wrappers are not double-counted.${examples ? ` Examples from the page: ${examples}.` : " No matching visible element text was observed."}`,
    });
  }

  const requiredChecksPassed = checks
    .filter(check => check.status !== "SKIPPED")
    .every(check => check.status === "PASS");

  return {
    verdict: requiredChecksPassed ? "VERIFIED" : "FAILED",
    pageUrl: snapshot.pageUrl,
    pageTitle: snapshot.pageTitle,
    unavailableReason: "",
    checks,
  };
}