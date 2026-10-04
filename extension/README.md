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

Selector-based checks make it possible to target a specific control or result instead of relying on a generic word elsewhere on the page. Every result check reports **PASS**, **FAIL**, or **SKIPPED**, with its expected value, observed value, and evidence. Checks left blank are **SKIPPED**. If Chrome refuses active-tab access, configured checks are **SKIPPED**, the overall verdict is **FAILED**, and no page evidence is invented.

## Access limits

The extension only inspects the current active tab after you open its popup and click Verify. It queries that tab's DOM through `chrome.scripting.executeScript`; it never calls `fetch()` to inspect external websites and has no broad website host permissions. Chrome can block extension scripts on protected pages such as `chrome://` pages and the Chrome Web Store; file URLs may require enabling **Allow access to file URLs** on the extension's details page. The extension reads the top-level page DOM, not cross-origin iframe contents.

The web dashboard's URL fetch is best-effort and can be blocked by CORS or other browser restrictions. Use this extension for direct inspection of an external page open in the active tab. It does not bypass CORS.

## Local checks

From the project root:

```sh
pnpm run typecheck:extension
pnpm run test:extension
pnpm run build:extension
```