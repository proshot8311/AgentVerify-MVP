import { inspectActivePage } from "./content.js";
import { createUnavailableResult, evaluateVerification, } from "./verifier.js";
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`AgentVerify popup is missing ${selector}.`);
    return element;
}
const form = requireElement("#verify-form");
const resultRegion = requireElement("#result");
const formError = requireElement("#form-error");
const verifyButton = requireElement("#verify-button");
function fieldValue(name) {
    const field = form.elements.namedItem(name);
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? field.value.trim()
        : "";
}
function collectInput() {
    const minimumValue = Number(fieldValue("minimumMatchingElements"));
    if (!Number.isInteger(minimumValue) || minimumValue < 1 || minimumValue > 10000) {
        throw new Error("Minimum Matching Elements must be a whole number from 1 to 10,000.");
    }
    return {
        agentClaim: fieldValue("agentClaim"),
        requiredText: fieldValue("requiredText"),
        forbiddenText: fieldValue("forbiddenText"),
        expectedPageTitle: fieldValue("expectedPageTitle"),
        minimumMatchingElements: minimumValue,
    };
}
function appendText(parent, tag, className, text) {
    const child = document.createElement(tag);
    child.className = className;
    child.textContent = text;
    parent.append(child);
    return child;
}
function renderCheck(check) {
    const card = document.createElement("article");
    card.className = "check";
    const heading = document.createElement("div");
    heading.className = "check-heading";
    appendText(heading, "span", "", check.name);
    appendText(heading, "span", `check-status ${check.status.toLowerCase().replace(/\s+/g, "-")}`, check.status);
    card.append(heading);
    appendText(card, "p", "", `Expected: ${check.expected}`);
    appendText(card, "p", "", `Observed: ${check.observed}`);
    const evidence = appendText(card, "p", "", "");
    const label = document.createElement("strong");
    label.textContent = "Evidence: ";
    evidence.append(label, document.createTextNode(check.evidence));
    return card;
}
function renderResult(input, result) {
    resultRegion.replaceChildren();
    resultRegion.hidden = false;
    const top = document.createElement("div");
    top.className = "result-top";
    const verdict = appendText(top, "h2", `verdict ${result.verdict === "VERIFIED" ? "verified" : "failed"}`, result.verdict);
    verdict.setAttribute("aria-label", `Verdict: ${result.verdict}`);
    resultRegion.append(top);
    appendText(resultRegion, "p", "result-page", result.pageUrl || (result.unavailableReason ? "Active tab could not be inspected." : "Page URL unavailable."));
    const claim = document.createElement("p");
    claim.className = "claim-context";
    const claimLabel = document.createElement("strong");
    claimLabel.textContent = "Agent Claim · context only";
    claim.append(claimLabel, document.createTextNode(input.agentClaim));
    resultRegion.append(claim);
    if (result.unavailableReason) {
        appendText(resultRegion, "p", "form-error", `Inspection unavailable: ${result.unavailableReason}. The verdict is FAILED because the page could not be checked; no page content was inferred.`);
    }
    const checks = document.createElement("div");
    checks.className = "check-list";
    for (const item of result.checks)
        checks.append(renderCheck(item));
    resultRegion.append(checks);
}
form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.hidden = true;
    formError.textContent = "";
    resultRegion.hidden = true;
    resultRegion.replaceChildren();
    let input;
    try {
        input = collectInput();
        if (!input.agentClaim)
            throw new Error("Enter the Agent Claim.");
        if (!input.requiredText)
            throw new Error("Enter Required Text to verify.");
    }
    catch (error) {
        formError.textContent = error instanceof Error ? error.message : "Check the verification fields.";
        formError.hidden = false;
        return;
    }
    verifyButton.disabled = true;
    verifyButton.textContent = "Inspecting active tab…";
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (typeof tab?.id !== "number")
            throw new Error("Chrome did not provide an active tab ID.");
        const request = {
            requiredText: input.requiredText,
            forbiddenText: input.forbiddenText,
        };
        const executions = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: inspectActivePage,
            args: [request],
        });
        const snapshot = executions[0]?.result;
        if (!snapshot)
            throw new Error("The active tab returned no DOM inspection result.");
        renderResult(input, evaluateVerification(input, snapshot));
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "Chrome did not allow inspection of this tab.";
        renderResult(input, createUnavailableResult(input, reason));
    }
    finally {
        verifyButton.disabled = false;
        verifyButton.textContent = "Verify Current Page";
    }
});
