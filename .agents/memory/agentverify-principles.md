---
name: AgentVerify product principles
description: Product-level constraints for verification behavior and the initial MVP scope.
---

AgentVerify's core claim is that an agent's completion message is not proof. Verdicts must come from deterministic, observable evidence, with checks and evidence retained alongside the result. The MVP must not imply AI capabilities or use paid APIs. It is local-first and does not require authentication or a paid backend. Browser inspection of arbitrary URLs is limited by browser fetch and CORS rules; when content cannot be inspected, report it as unavailable rather than inferring a result.

**Why:** These are explicit product principles and scope boundaries from the user's AgentVerify brief.

**How to apply:** For new verification sources or persistence options, preserve traceable observations and disclose access limits. Do not add AI, paid integrations, authentication, or remote persistence unless the user changes the scope.