# Global prompt scaffold in code; Langfuse for tracing only

The system prompt has two parts. **Per-client content** (Guidelines, QA Samples) is tenant data and lives in Supabase, scoped by `client_id`. The **global scaffold** — the shared prompt engineering that wraps that content (how to use retrieved KB chunks, the strict-grounding/refusal instructions from [[0005-strict-grounding-with-graceful-refusal]], how Guidelines and QA Samples are woven in) — lives in **code**, version-controlled.

This diverges from the spec, which pitched Langfuse's prompt-management feature for no-deploy prompt edits. We are **not** using Langfuse prompt management at launch. The reasoning: the content that actually churns (a client's Guidelines and QA Samples) is already editable without a deploy because it is data rows in Supabase; only the global scaffold is left, and it changes rarely. The scaffold's blast radius is *every client at once*, so routing its edits through code review is a feature, not a limitation — and keeping it in code avoids making Langfuse a hot-path dependency that would need caching and an unreachable-fallback.

Langfuse is still used, for **tracing** (its clear win). Adopting its prompt-management later is cheap if scaffold iteration cadence ever demands it — this decision is recorded so the absence of prompt-management isn't mistaken for an oversight and "fixed."
