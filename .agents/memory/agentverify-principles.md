---
name: AgentVerify product principles
description: Product-level constraints for verification behavior and the initial MVP scope.
---

AgentVerify's core claim is that an agent's completion message is not proof. Verdicts must come from deterministic, observable evidence, with checks and evidence retained alongside the result. The MVP must not imply AI capabilities or use paid APIs. It is local-first and does not require authentication or a paid backend. Keep the web dashboard as the existing UI/evidence ledger and label URL-fetch checks best-effort. The Chrome extension is the browser-side engine for direct, user-authorized active-tab DOM inspection; do not use fetch to bypass CORS. If inspection is blocked, report it as unavailable rather than inferring a result.

**Why:** These are explicit product principles, scope boundaries, and architecture decisions from the user's AgentVerify brief.

**How to apply:** Preserve traceable observations and disclose access limits. Use the extension to inspect the current permitted tab, keep dashboard URL fetches clearly best-effort, and never infer blocked content. Do not add AI, paid integrations, authentication, or remote persistence unless the user changes the scope.