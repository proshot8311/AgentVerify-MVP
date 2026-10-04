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

After changing extension source files, run the build command again. TypeScript output is written to `extension/dist/`, which the popup loads.

## What is checked

- **Agent Claim** is retained in the popup report as context only; it does not affect the verdict.
- **Required Text** must appear in the rendered body text.
- **Forbidden Text** must be absent when configured.
- **Expected Page Title** must match `document.title` when configured.
- **Minimum Matching Elements** counts visible, most-specific DOM elements whose rendered text contains Required Text. Nested matching wrappers are not double-counted.
- Text comparisons collapse whitespace and ignore letter casing.

Each check shows its expected value, observed result, and evidence read from the active tab. If Chrome refuses access to a page, checks are marked **NOT CHECKED** and the verdict is **FAILED**; the extension does not infer what the page contains.

## Access limits

The extension only inspects the active tab after you open its popup and click Verify. It has no broad website host permissions. Chrome can block extension scripts on protected pages such as `chrome://` pages and the Chrome Web Store; file URLs may require enabling **Allow access to file URLs** on the extension's details page. The extension reads the top-level page DOM, not cross-origin iframe contents.

The web dashboard's URL fetch is best-effort and can be blocked by CORS or other browser restrictions. Use this extension for direct inspection of an external page open in the active tab. It does not bypass CORS.

## Checks

From the project root:

```sh
pnpm run typecheck:extension
pnpm run test:extension
pnpm run build:extension
```