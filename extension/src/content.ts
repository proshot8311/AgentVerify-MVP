export type AttributeMatchMode = "contains" | "exact";

export interface PageInspectionRequest {
  requiredText?: string;
  forbiddenText?: string;
  selectorExists?: string;
  selectorTextSelector?: string;
  selectorText?: string;
  attributeSelector?: string;
  attributeName?: string;
  attributeValue?: string;
  attributeMatchMode?: AttributeMatchMode;
}

export interface MatchingElementSample {
  tag: string;
  text: string;
}

export interface SelectorInspection {
  selector: string;
  error: string;
  matchCount: number;
  visibleMatchCount: number;
  visibleSamples: MatchingElementSample[];
}

export interface SelectorTextInspection extends SelectorInspection {
  matchingVisibleCount: number;
  matchingSamples: MatchingElementSample[];
}

export interface AttributeValueSample {
  tag: string;
  text: string;
  value: string | null;
}

export interface AttributeInspection {
  selector: string;
  error: string;
  matchCount: number;
  visibleMatchCount: number;
  attributeName: string;
  matchingVisibleCount: number;
  valueSamples: AttributeValueSample[];
  matchingSamples: AttributeValueSample[];
}

export interface PageSnapshot {
  pageUrl: string;
  pageTitle: string;
  bodyAvailable: boolean;
  renderedBodyTextLength: number;
  requiredTextFound: boolean | null;
  requiredTextExcerpt: string;
  forbiddenTextFound: boolean | null;
  forbiddenTextExcerpt: string;
  matchingElementCount: number;
  matchingElementSamples: MatchingElementSample[];
  selectorExistence: SelectorInspection;
  selectorText: SelectorTextInspection;
  attributeValue: AttributeInspection;
}

/**
 * This function is injected by chrome.scripting.executeScript into the active
 * tab. Keep its implementation self-contained: Chrome serializes the function
 * body, not this module's surrounding scope.
 */
export function inspectActivePage(request: PageInspectionRequest): PageSnapshot {
  function normalize(value: string): string {
    return value.replace(/\s+/g, " ").trim().toLowerCase();
  }

  function displayText(value: string): string {
    const collapsed = value.replace(/\s+/g, " ").trim();
    return collapsed.length > 180 ? `${collapsed.slice(0, 177)}…` : collapsed;
  }

  function isVisible(element: Element): boolean {
    if (element.getClientRects().length === 0) return false;

    let ancestor: Element | null = element;
    while (ancestor) {
      if (ancestor.getAttribute("aria-hidden")?.toLowerCase() === "true") return false;
      const style = window.getComputedStyle(ancestor);
      const opacity = Number.parseFloat(style.opacity);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        (Number.isFinite(opacity) && opacity === 0)
      ) {
        return false;
      }
      ancestor = ancestor.parentElement;
    }
    return true;
  }

  function renderedText(element: Element): string {
    const innerText = (element as HTMLElement).innerText;
    return typeof innerText === "string" ? innerText : element.textContent ?? "";
  }

  function sample(element: Element): MatchingElementSample {
    return {
      tag: element.tagName.toLowerCase(),
      text: displayText(renderedText(element)),
    };
  }

  function excerpt(value: string, phrase: string): string {
    const index = value.indexOf(phrase);
    if (index < 0) return "";
    const start = Math.max(0, index - 55);
    const end = Math.min(value.length, index + phrase.length + 75);
    return `${start > 0 ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`;
  }

  function querySelector(selector: string): { elements: Element[]; error: string } {
    if (!selector) return { elements: [], error: "" };
    try {
      return { elements: Array.from(document.querySelectorAll(selector)), error: "" };
    } catch (error) {
      return {
        elements: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function inspectSelector(selector: string): SelectorInspection {
    const query = querySelector(selector);
    const visible = query.elements.filter(isVisible);
    return {
      selector,
      error: query.error,
      matchCount: query.elements.length,
      visibleMatchCount: visible.length,
      visibleSamples: visible.slice(0, 5).map(sample),
    };
  }

  function inspectSelectorText(selector: string, expectedText: string): SelectorTextInspection {
    const query = querySelector(selector);
    const visible = query.elements.filter(isVisible);
    const expected = normalize(expectedText);
    const matching = expected
      ? visible.filter(element => normalize(renderedText(element)).includes(expected))
      : [];
    return {
      selector,
      error: query.error,
      matchCount: query.elements.length,
      visibleMatchCount: visible.length,
      visibleSamples: visible.slice(0, 5).map(sample),
      matchingVisibleCount: matching.length,
      matchingSamples: matching.slice(0, 5).map(sample),
    };
  }

  function inspectAttribute(
    selector: string,
    attributeName: string,
    expectedValue: string,
    mode: AttributeMatchMode,
  ): AttributeInspection {
    const query = querySelector(selector);
    const visible = query.elements.filter(isVisible);
    const valueSamples: AttributeValueSample[] = [];
    let matchingVisibleCount = 0;
    let error = query.error;

    if (!error && attributeName) {
      for (const element of visible) {
        let value: string | null;
        try {
          value = element.getAttribute(attributeName);
        } catch (attributeError) {
          error = attributeError instanceof Error ? attributeError.message : String(attributeError);
          break;
        }
        const matches = value !== null && expectedValue !== "" && (
          mode === "exact" ? value === expectedValue : value.includes(expectedValue)
        );
        const item = {
          tag: element.tagName.toLowerCase(),
          text: displayText(renderedText(element)),
          value: value === null
            ? null
            : value.length > 180
              ? `${value.slice(0, 177)}…`
              : value,
        };
        if (valueSamples.length < 5) valueSamples.push(item);
        if (matches) matchingVisibleCount += 1;
      }
    }

    const matchingSamples = valueSamples.filter(item => {
      if (item.value === null || expectedValue === "") return false;
      return mode === "exact" ? item.value === expectedValue : item.value.includes(expectedValue);
    });

    return {
      selector,
      error,
      matchCount: query.elements.length,
      visibleMatchCount: visible.length,
      attributeName,
      matchingVisibleCount,
      valueSamples,
      matchingSamples,
    };
  }

  const body = document.body;
  const bodyText = body?.innerText ?? body?.textContent ?? "";
  const normalizedBody = normalize(bodyText);
  const required = normalize(request.requiredText ?? "");
  const forbidden = normalize(request.forbiddenText ?? "");
  const requiredIndex = required ? normalizedBody.indexOf(required) : -1;
  const forbiddenIndex = forbidden ? normalizedBody.indexOf(forbidden) : -1;

  const elements: Element[] = body
    ? [body, ...Array.from(body.querySelectorAll("*"))]
    : [];
  const matchingElements = new Set<Element>();
  const normalizedElementText = new Map<Element, string>();

  for (const element of elements) {
    if (!isVisible(element)) continue;
    const text = normalize(renderedText(element));
    normalizedElementText.set(element, text);
    if (required && text.includes(required)) matchingElements.add(element);
  }

  // Count the most-specific matching nodes, so a text span and all of its
  // matching wrappers are not counted as separate evidence.
  const matchingBelow = new Map<Element, boolean>();
  const countedElements: Element[] = [];
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    const hasMatchingChild = Array.from(element.children).some(child => matchingBelow.get(child) === true);
    const matchesHere = matchingElements.has(element);
    if (matchesHere && !hasMatchingChild) countedElements.push(element);
    matchingBelow.set(element, matchesHere || hasMatchingChild);
  }
  countedElements.reverse();

  const attributeMode = request.attributeMatchMode === "exact" ? "exact" : "contains";

  return {
    pageUrl: window.location.href,
    pageTitle: document.title,
    bodyAvailable: body !== null,
    renderedBodyTextLength: bodyText.length,
    requiredTextFound: required ? requiredIndex >= 0 : null,
    requiredTextExcerpt: requiredIndex >= 0 ? excerpt(normalizedBody, required) : "",
    forbiddenTextFound: forbidden ? forbiddenIndex >= 0 : null,
    forbiddenTextExcerpt: forbiddenIndex >= 0 ? excerpt(normalizedBody, forbidden) : "",
    matchingElementCount: countedElements.length,
    matchingElementSamples: countedElements.slice(0, 5).map(element => ({
      tag: element.tagName.toLowerCase(),
      text: normalizedElementText.get(element) ?? "",
    })),
    selectorExistence: inspectSelector(request.selectorExists ?? ""),
    selectorText: inspectSelectorText(
      request.selectorTextSelector ?? "",
      request.selectorText ?? "",
    ),
    attributeValue: inspectAttribute(
      request.attributeSelector ?? "",
      request.attributeName ?? "",
      request.attributeValue ?? "",
      attributeMode,
    ),
  };
}