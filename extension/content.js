/**
 * This function is injected by chrome.scripting.executeScript into the active
 * tab. Keep its implementation self-contained: Chrome serializes the function
 * body, not this module's surrounding scope.
 */
export function inspectActivePage(request) {
    function normalize(value) {
        return value.replace(/\s+/g, " ").trim().toLowerCase();
    }
    function isVisible(element) {
        if (element.getClientRects().length === 0)
            return false;
        let ancestor = element;
        while (ancestor) {
            if (ancestor.getAttribute("aria-hidden")?.toLowerCase() === "true")
                return false;
            const style = window.getComputedStyle(ancestor);
            const opacity = Number.parseFloat(style.opacity);
            if (style.display === "none" ||
                style.visibility === "hidden" ||
                style.visibility === "collapse" ||
                (Number.isFinite(opacity) && opacity === 0)) {
                return false;
            }
            ancestor = ancestor.parentElement;
        }
        return true;
    }
    function excerpt(value, phrase) {
        const index = value.indexOf(phrase);
        if (index < 0)
            return "";
        const start = Math.max(0, index - 55);
        const end = Math.min(value.length, index + phrase.length + 75);
        return `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
    }
    const body = document.body;
    const bodyText = body?.innerText ?? body?.textContent ?? "";
    const normalizedBody = normalize(bodyText);
    const required = normalize(request.requiredText);
    const forbidden = normalize(request.forbiddenText);
    const requiredIndex = required ? normalizedBody.indexOf(required) : -1;
    const forbiddenIndex = forbidden ? normalizedBody.indexOf(forbidden) : -1;
    const elements = body
        ? [body, ...Array.from(body.querySelectorAll("*"))]
        : [];
    const matchingElements = new Set();
    const normalizedElementText = new Map();
    for (const element of elements) {
        if (!isVisible(element))
            continue;
        const text = normalize(element.innerText ?? element.textContent ?? "");
        normalizedElementText.set(element, text);
        if (required && text.includes(required))
            matchingElements.add(element);
    }
    // Count the most-specific matching nodes, so a text span and all of its
    // matching wrappers are not counted as separate evidence.
    const matchingBelow = new Map();
    const countedElements = [];
    for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index];
        const hasMatchingChild = Array.from(element.children).some(child => matchingBelow.get(child) === true);
        const matchesHere = matchingElements.has(element);
        if (matchesHere && !hasMatchingChild)
            countedElements.push(element);
        matchingBelow.set(element, matchesHere || hasMatchingChild);
    }
    countedElements.reverse();
    return {
        pageUrl: window.location.href,
        pageTitle: document.title,
        bodyAvailable: body !== null,
        renderedBodyTextLength: bodyText.length,
        requiredTextFound: requiredIndex >= 0,
        requiredTextExcerpt: requiredIndex >= 0 ? excerpt(normalizedBody, required) : "",
        forbiddenTextFound: forbidden ? forbiddenIndex >= 0 : null,
        forbiddenTextExcerpt: forbiddenIndex >= 0 ? excerpt(normalizedBody, forbidden) : "",
        matchingElementCount: countedElements.length,
        matchingElementSamples: countedElements.slice(0, 5).map(element => ({
            tag: element.tagName.toLowerCase(),
            text: normalizedElementText.get(element) ?? "",
        })),
    };
}
