# AgentVerify Chrome Extension

The extension verifies claims against the rendered DOM of the page that is open in the active tab. It runs inspection in that tab with Chrome's Manifest V3 `activeTab` and `scripting` permissions. It does not fetch the target page, upload page content, or try to bypass CORS.

## Build and load in Chrome

1. From the project root, build the extension:

   ```sh
   pnpm run build:extension
   ```

2. In Chrome, open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this project's `extension` folder (the folder containing `manifest.json`).
6. Open an ordinary webpage, such as `https://github.com/`, and click the AgentVerify extension icon.
7. Fill in the claim and checks, then click **Verify Current Page**.

After changing extension source files, run the build command again. It generates `popup.js`, `content.js`, and `verifier.js` directly in the `extension/` folder. The popup imports the inspection function from `content.js` and injects it into the active tab only after you click **Verify Current Page**; it is not a persistent, all-sites content script.

## Contract checks

The **Agent Claim** is retained as context only; it does not affect the verdict. Configure one or more optional checks:

- **URL** compares the active tab's `window.location.href` using literal, case-sensitive **contains** or **exact** matching.
- **Required Text** and **Forbidden Text** check rendered body text. Comparisons collapse whitespace and ignore letter casing.
- **Exact Page Title** compares the entered value to `document.title` exactly, including case and whitespace.
- **Minimum Matching Visible Elements** counts visible, most-specific DOM elements containing Required Text. Nested matching wrappers are not double-counted, and this check requires Required Text.
- **CSS Selector Exists** passes only if at least one element matched by the selector is visible.
- **CSS Selector Text** checks normalized rendered text on visible elements matched by the selector.
- **Attribute / Value** checks the raw `getAttribute()` value on visible elements matched by the selector, using literal, case-sensitive **contains** or **exact** matching. For example, select `a[data-testid="created-order"]`, inspect `href`, and require it to contain `/orders/123`.

Every run requires a **Stable Target Selector**. It must resolve to one visible element with a unique ID or supported data attribute (`data-testid`, `data-test`, `data-qa`, `data-cy`, or `data-automation-id`). Positional selectors such as `:nth-child()` are rejected. Set the polling interval and maximum wait; the extension re-reads the active tab and requires two consecutive consistent observations of that same target before returning **PASS** or **FAIL**. Changing state, ambiguous or fragile targets, timeout, and unavailable evidence produce **UNVERIFIED**. Every check includes its expected value, observed value, and evidence; the result also reports its evidence source, observation count, and timing or limitation details. Checks left blank are **SKIPPED**.

## Access limits

The extension only inspects the current active tab after you open its popup and click Verify. It queries that tab's DOM through `chrome.scripting.executeScript`; it never calls `fetch()` to inspect external websites and has no broad website host permissions. Chrome can block extension scripts on protected pages such as `chrome://` pages and the Chrome Web Store; file URLs may require enabling **Allow access to file URLs** on the extension's details page. The extension reads the top-level page DOM, not cross-origin iframe contents.

The web dashboard's URL fetch is best-effort and can be blocked by CORS or other browser restrictions. It parses the fetched HTML, which may differ from the active page's rendered DOM. Use this extension for direct inspection of an external page open in the active tab. It does not bypass CORS.

Stability compares visible-text samples truncated to 180 characters, so changes outside those samples may not be detected. **Required Text** and **Forbidden Text** checks inspect the page body, not just the target; use selector-based checks when you need to scope evidence to elements. Repeated DOM reads show browser-visible state during the observation window only: they do not prove that an agent caused a change, that application state was persisted, or that external effects such as emails or webhooks occurred. A **PASS** supports only the specific observable condition tested. Extension read-back observations are currently not persisted to the dashboard.

## Local checks

From the project root:

```sh
pnpm run typecheck:extension
pnpm run test:extension
pnpm run build:extension
```