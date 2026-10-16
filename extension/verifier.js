export function normalizeForComparison(value) {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
}
function skippedCheck(name, expected, reason) {
    return { name, status: "SKIPPED", expected, observed: "Skipped", evidence: reason };
}
function uninspectedCheck(name, expected, reason) {
    return {
        name,
        status: "UNVERIFIED",
        expected,
        observed: "Not inspected",
        evidence: `The active tab could not be inspected: ${reason}. No page content was observed and no conclusion was inferred.`,
    };
}
function unobservedCheck(name, expected, reason) {
    return {
        name,
        status: "UNVERIFIED",
        expected,
        observed: "Not observed",
        evidence: `${reason} No conclusion was inferred from missing evidence.`,
    };
}
function evaluatedCheck(name, expected, passed, observed, evidence) {
    return { name, status: passed ? "PASS" : "FAIL", expected, observed, evidence };
}
function describeSamples(samples) {
    return samples
        .map(sample => `<${sample.tag}> ${JSON.stringify(sample.text)}`)
        .join("; ");
}
function unavailableOrSkipped(name, expected, configured, reason) {
    return configured
        ? uninspectedCheck(name, expected, reason)
        : skippedCheck(name, expected, "This optional check was not configured.");
}
function selectorErrorCheck(name, expected, report) {
    if (!report.error)
        return null;
    return {
        name,
        status: "UNVERIFIED",
        expected,
        observed: "The CSS selector could not be evaluated.",
        evidence: `The active tab rejected CSS selector ${JSON.stringify(report.selector)}: ${report.error}. No matching page element was claimed and no conclusion was inferred.`,
    };
}
function buildChecks(input, snapshot, unavailableReason = "") {
    const checks = [];
    const urlExpected = input.urlMatchMode === "exact"
        ? `URL exactly equals ${JSON.stringify(input.expectedUrl)}`
        : `URL contains ${JSON.stringify(input.expectedUrl)}`;
    if (!input.expectedUrl) {
        checks.push(skippedCheck("URL", urlExpected, "No expected URL was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("URL", urlExpected, true, unavailableReason));
    }
    else if (!snapshot.pageUrl) {
        checks.push(unobservedCheck("URL", urlExpected, "The active tab did not provide a URL to compare."));
    }
    else {
        const passed = input.urlMatchMode === "exact"
            ? snapshot.pageUrl === input.expectedUrl
            : snapshot.pageUrl.includes(input.expectedUrl);
        checks.push(evaluatedCheck("URL", urlExpected, passed, JSON.stringify(snapshot.pageUrl), `Read window.location.href directly in the active tab. URL comparison is literal and case-sensitive.`));
    }
    const requiredExpected = `Rendered page text contains ${JSON.stringify(input.requiredText)} (case and whitespace normalized)`;
    if (!input.requiredText) {
        checks.push(skippedCheck("Required Text", "Rendered page text contains the configured phrase.", "No Required Text was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("Required Text", requiredExpected, true, unavailableReason));
    }
    else if (!snapshot.bodyAvailable || snapshot.requiredTextFound === null) {
        checks.push(unobservedCheck("Required Text", requiredExpected, "The active tab did not expose rendered body text."));
    }
    else {
        const passed = snapshot.requiredTextFound;
        checks.push(evaluatedCheck("Required Text", requiredExpected, passed, passed ? "Phrase found in rendered body text." : "Phrase not found in rendered body text.", passed
            ? `Inspected ${snapshot.renderedBodyTextLength} characters of active-tab body text. Normalized match context: ${JSON.stringify(snapshot.requiredTextExcerpt)}.`
            : `Inspected ${snapshot.renderedBodyTextLength} characters of active-tab body text; the normalized phrase was absent.`));
    }
    const forbiddenExpected = `Rendered page text does not contain ${JSON.stringify(input.forbiddenText)} (case and whitespace normalized)`;
    if (!input.forbiddenText) {
        checks.push(skippedCheck("Forbidden Text", "Rendered page text excludes the configured phrase.", "No Forbidden Text was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("Forbidden Text", forbiddenExpected, true, unavailableReason));
    }
    else if (!snapshot.bodyAvailable || snapshot.forbiddenTextFound === null) {
        checks.push(unobservedCheck("Forbidden Text", forbiddenExpected, "The active tab did not expose rendered body text."));
    }
    else {
        const found = snapshot.forbiddenTextFound;
        checks.push(evaluatedCheck("Forbidden Text", forbiddenExpected, !found, found ? "Forbidden phrase found in rendered body text." : "Forbidden phrase not found in rendered body text.", found
            ? `Inspected ${snapshot.renderedBodyTextLength} characters of active-tab body text. Normalized match context: ${JSON.stringify(snapshot.forbiddenTextExcerpt)}.`
            : `Inspected ${snapshot.renderedBodyTextLength} characters of active-tab body text; the normalized forbidden phrase was absent.`));
    }
    const titleExpected = `document.title exactly equals ${JSON.stringify(input.expectedPageTitle)}`;
    if (!input.expectedPageTitle.trim()) {
        checks.push(skippedCheck("Exact Page Title", "document.title exactly equals the configured title.", "No expected page title was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("Exact Page Title", titleExpected, true, unavailableReason));
    }
    else {
        const passed = snapshot.pageTitle === input.expectedPageTitle;
        checks.push(evaluatedCheck("Exact Page Title", titleExpected, passed, JSON.stringify(snapshot.pageTitle), `Read document.title directly in the active tab. Comparison is exact, including case and whitespace.`));
    }
    const minimum = input.minimumMatchingElements;
    const minimumExpected = `At least ${minimum ?? "the configured minimum"} visible, most-specific element(s) containing Required Text`;
    if (minimum === null) {
        checks.push(skippedCheck("Minimum Matching Visible Elements", "A minimum count of visible Required Text matches.", "No minimum matching element count was configured."));
    }
    else if (!input.requiredText) {
        checks.push(skippedCheck("Minimum Matching Visible Elements", minimumExpected, "Required Text is needed to define which visible elements to count."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("Minimum Matching Visible Elements", minimumExpected, true, unavailableReason));
    }
    else if (!snapshot.bodyAvailable) {
        checks.push(unobservedCheck("Minimum Matching Visible Elements", minimumExpected, "The active tab did not expose a document body."));
    }
    else {
        const count = snapshot.matchingElementCount;
        const examples = describeSamples(snapshot.matchingElementSamples);
        checks.push(evaluatedCheck("Minimum Matching Visible Elements", minimumExpected, count >= minimum, `${count} visible matching element(s).`, `Counted ${count} visible, most-specific DOM element(s) whose rendered text contains the normalized Required Text. Nested matching wrappers are not double-counted.${examples ? ` Examples: ${examples}.` : " No matching visible element text was observed."}`));
    }
    const selectorExistsExpected = `At least one visible DOM element matches CSS selector ${JSON.stringify(input.selectorExists)}`;
    if (!input.selectorExists) {
        checks.push(skippedCheck("CSS Selector Exists", "A visible page element matches the configured CSS selector.", "No existence selector was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("CSS Selector Exists", selectorExistsExpected, true, unavailableReason));
    }
    else {
        const report = snapshot.selectorExistence;
        const invalid = selectorErrorCheck("CSS Selector Exists", selectorExistsExpected, report);
        if (invalid) {
            checks.push(invalid);
        }
        else {
            const samples = describeSamples(report.visibleSamples);
            checks.push(evaluatedCheck("CSS Selector Exists", selectorExistsExpected, report.visibleMatchCount > 0, `${report.matchCount} DOM match(es), ${report.visibleMatchCount} visible.`, `Ran document.querySelectorAll(${JSON.stringify(input.selectorExists)}) in the active tab. Only visible matches satisfy this check.${samples ? ` Visible samples: ${samples}.` : report.matchCount > 0 ? " DOM matches existed, but none were visible." : " No matching DOM element was observed."}`));
        }
    }
    const selectorTextExpected = `A visible element matching ${JSON.stringify(input.selectorTextSelector)} contains ${JSON.stringify(input.selectorText)} (case and whitespace normalized)`;
    if (!input.selectorTextSelector && !input.selectorText) {
        checks.push(skippedCheck("CSS Selector Text", "A selected visible element contains the configured text.", "No selector-text check was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("CSS Selector Text", selectorTextExpected, true, unavailableReason));
    }
    else {
        const report = snapshot.selectorText;
        const invalid = selectorErrorCheck("CSS Selector Text", selectorTextExpected, report);
        if (invalid) {
            checks.push(invalid);
        }
        else {
            const samples = describeSamples(report.matchingSamples);
            checks.push(evaluatedCheck("CSS Selector Text", selectorTextExpected, report.matchingVisibleCount > 0, `${report.matchingVisibleCount} visible selected element(s) contain the expected text; ${report.matchCount} DOM match(es) total.`, `Compared rendered text from visible matches of ${JSON.stringify(input.selectorTextSelector)} in the active tab.${samples ? ` Matching elements: ${samples}.` : ` ${report.visibleMatchCount} selected element(s) were visible; none contained the expected text.`}`));
        }
    }
    const attributeExpected = `A visible element matching ${JSON.stringify(input.attributeSelector)} has raw ${JSON.stringify(input.attributeName)} attribute ${input.attributeMatchMode} ${JSON.stringify(input.attributeValue)}`;
    if (!input.attributeSelector && !input.attributeName && !input.attributeValue) {
        checks.push(skippedCheck("Attribute / Value", "A selected visible element has the configured attribute value.", "No attribute/value check was configured."));
    }
    else if (!snapshot) {
        checks.push(unavailableOrSkipped("Attribute / Value", attributeExpected, true, unavailableReason));
    }
    else {
        const report = snapshot.attributeValue;
        const invalid = selectorErrorCheck("Attribute / Value", attributeExpected, report);
        if (invalid) {
            checks.push(invalid);
        }
        else {
            const values = report.valueSamples
                .map(sample => `<${sample.tag}> ${input.attributeName}=${JSON.stringify(sample.value)} text=${JSON.stringify(sample.text)}`)
                .join("; ");
            checks.push(evaluatedCheck("Attribute / Value", attributeExpected, report.matchingVisibleCount > 0, `${report.matchingVisibleCount} visible selected element(s) matched; ${report.matchCount} DOM match(es) total.`, `Read the raw ${JSON.stringify(input.attributeName)} attribute with getAttribute() from visible matches of ${JSON.stringify(input.attributeSelector)} in the active tab. Comparison is literal and case-sensitive.${values ? ` Observed values: ${values}.` : " No visible attribute values were observed."}`));
        }
    }
    return checks;
}
function resultVerdict(checks) {
    if (checks.length === 0)
        return "UNVERIFIED";
    const configuredChecks = checks.filter(check => check.status !== "SKIPPED");
    if (configuredChecks.some(check => check.status === "FAIL"))
        return "FAIL";
    if (configuredChecks.some(check => check.status !== "PASS")) {
        return "UNVERIFIED";
    }
    return configuredChecks.length > 0 ? "PASS" : "SKIPPED";
}
export function createUnavailableResult(input, reason) {
    const checks = buildChecks(input, null, reason);
    return {
        verdict: resultVerdict(checks),
        pageUrl: "",
        pageTitle: "",
        unavailableReason: reason,
        checks,
    };
}
export function evaluateVerification(input, snapshot) {
    const checks = buildChecks(input, snapshot);
    return {
        verdict: resultVerdict(checks),
        pageUrl: snapshot.pageUrl,
        pageTitle: snapshot.pageTitle,
        unavailableReason: "",
        checks,
    };
}
