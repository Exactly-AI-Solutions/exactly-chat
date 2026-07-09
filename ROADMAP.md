# Exactly Chat — Roadmap

This roadmap tracks the work for the Exactly Chat API from design through launch.
It is derived directly from the design record: the glossary in [CONTEXT.md](./CONTEXT.md) and the decisions in [docs/adr/](./docs/adr/).
Each implementation phase names the ADR(s) that govern it, so the "why" for any task is one click away.

Status legend: ✅ done · 🔨 in progress · ⬜ not started · 🕓 deferred (post-launch).

---

## Done so far — Design phase ✅

The architecture has been fully grilled and the load-bearing decisions are locked and documented.
No application code exists yet; this phase produced the shared understanding everything else builds on.

- ✅ **Domain glossary** — [CONTEXT.md](./CONTEXT.md): Client, Chat Agent, Conversation, Message, End User, Widget, API Key, Domain Whitelist, Agent Scoping, Usage Quota, Knowledge Base, QA Samples, Guidelines.
- ✅ **ADR-0001** — Server-authoritative conversations (DB owns history; committed driver is transcript analysis; resume left open, not built).
- ✅ **ADR-0002** — Publishable API key with layered abuse defense (domain whitelist + agent scoping + per-client metering; fast hash, not bcrypt; per-client enforcement only).
- ✅ **ADR-0003** — OpenAI `text-embedding-3-small` for embeddings; chat stays on Anthropic.
- ✅ **ADR-0004** — Shared schema with `client_id`; isolation via one enforced data-access seam; no RLS (service-role bypasses it).
- ✅ **ADR-0005** — Strict grounding with graceful refusal (below-threshold → decline in voice, never general-knowledge fallback).
- ✅ **ADR-0006** — Global prompt scaffold in code; Langfuse for tracing only, not prompt management.
- ✅ **ADR-0007** — Scope is anonymous public FAQ only; transcripts verbatim and indefinite; PII/retention deferred; internal PII bots out of scope.

Design decisions captured outside the ADRs (reasonable defaults, easy to revisit):
- Prompt assembly: Guidelines + QA Samples injected wholesale; Knowledge Base retrieved (CONTEXT.md).
- KB updates: full replace per client, transactional, Exactly-operated offline ingestion.
- Chat model: Sonnet 4.6, thinking disabled, low effort, streaming — kept as config, not hardcoded.

---

## Work to be done — Implementation

Phases are ordered so each one produces something testable and the next builds on it.
Task-level tuning values (chunk size, top-K, similarity threshold, exact columns) are settled during the phase they belong to, not up front.

**Launch target: one client, deploying soon.**
The immediate goal is to get the core chat working end-to-end for a **single** client and internally test it all the way up to deployment.
The system stays multi-tenant by construction (`client_id` on every tenant-owned row — ADR-0004), because that is free and correct; we simply build **no multi-client tooling** yet.
Client, key, Domain Whitelist, Guidelines, and QA Samples are all managed **manually** (Supabase dashboard / seed scripts) for now.
An admin portal for managing chat agents, keys, and config is explicitly **deferred** until the client count justifies it.

**Deployed (production).** Live at `https://exactly-chat.vercel.app` (Vercel project `matthew-morales-projects/exactly-chat`; env vars set for production + preview). Verified end-to-end on production: health, `/api/chat/config`, and grounded streaming `/api/chat`. Integration guide for external callers at `docs/integration/howorth-francis-chat-api.md`. Client config (guidelines/QA/KB/widget/origins) is read per-request from Supabase, so config and origin changes are **instant** (no redeploy); only code changes need `npx vercel --prod`.

**Interim demo path — full-KB mode (ADR-0008).** While OpenAI credits are unavailable, `config.retrieval.mode = "full-kb"` runs the whole KB in the prompt (no embeddings, Anthropic only). Populate via `npm run ingest-text`; the KB text lives in `clients.knowledge_base` (migration `0003`). A minimal demo UI is at `/demo`. Behavior verified live (grounded answers + graceful refusal). Flip `mode` to `"embeddings"` when credits return — that path is already built.

### Phase 0 — Project scaffolding ✅

Goal: a deployable skeleton with all external services wired.

- ✅ Next.js 16 (App Router, `src/`) project — builds clean, TypeScript passing.
- ✅ Supabase project; `pgvector` enabled (via the Phase 1 migration).
- ✅ Install dependencies: `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@supabase/supabase-js`, `@langfuse/otel`, `@langfuse/vercel-ai-sdk`, `@vercel/otel`, `pdf-parse`, `dotenv`.
- ✅ Environment/config plumbing — `src/config/index.ts` reads all env vars by name; `/api/health` reports presence.
- ✅ Central typed config for tunables (chat model, thinking, effort, top-K, similarity threshold) in `src/config`.

Done when: ✅ the app builds and `/api/health` responds with env-wiring status. (Supabase secret key still to be added — see Phase 1.)

Notes: on **Next.js 16**, **AI SDK v7** (`ai@7`, `@ai-sdk/*@4`), **pdf-parse v2** — all newer than typical defaults; APIs verified per-phase, not assumed.

### Phase 1 — Data model + tenant data-access seam ✅ (governs: ADR-0004)

Goal: the shared schema and the single enforced access path everything else uses.

- ✅ Schema/migration `supabase/migrations/0001_init.sql` for `clients`, `api_keys`, `conversations`, `messages`, `kb_chunks` (each tenant-owned table carries `client_id`); `pgvector` self-enabled by the migration.
- ✅ `api_keys`: `key_prefix` (unique, indexed) + `key_hash` (SHA-256) — not bcrypt (ADR-0002).
- ✅ `kb_chunks`: `vector(1536)`, provenance columns (source filename, page), `client_id`, HNSW cosine index.
- ✅ The **data-access seam** (`src/lib/data.ts`): `dataForClient(clientId)` — every method injects `client_id`; `server-only` guarded; the sole path to tenant data.
- ✅ `match_kb_chunks` RPC takes `client_id` and filters + thresholds inside the function.
- ✅ RLS enabled on all tables (policy-free) as a public-REST lockout; server uses the secret key which bypasses it (ADR-0004, updated).

Done when: ✅ schema applied; `/api/health/db` returns `{"status":"ok"}`; the seam is the only import surface for tenant tables.

### Phase 2 — Knowledge Base ingestion 🔨 (governs: KB full-replace decision, ADR-0003)

Goal: a real, retrievable KB for a seeded client.

- ✅ Offline script `scripts/ingest.ts` (`npm run ingest -- --client <id> --dir <pdfs>`): PDFs → pdf-parse v2 (per-page) → chunk → OpenAI `text-embedding-3-small` via `embedMany` → insert.
- ✅ Full-replace-per-client as **build-then-swap** (insert new, then delete old) so the KB is never empty mid-ingest. (Not a single txn — fine for offline; make transactional before re-ingesting a live client.)
- ✅ Provenance (source filename, page) on every chunk.
- ✅ Verified pgvector accepts JS number arrays for both insert and the RPC (no stringify needed).
- ⬜ Run against the real launch client's PDFs — needs the client row created and its PDFs in a folder.

Done when: running the script for the launch client yields chunks whose count/provenance match the documents, idempotently.

### Phase 3 — Retrieval + prompt assembly 🔨 (governs: ADR-0005, ADR-0006, prompt-assembly decision)

Goal: given a client + a question, produce the exact prompt the model will see.

- ✅ `src/lib/embedding.ts` — embeds the question with the same OpenAI model as ingestion (via `config.embedding.model`, ADR-0003).
- ✅ Similarity RPC scoped by `client_id` + threshold, called through the seam (`data.matchKbChunks`).
- ✅ `src/lib/prompt.ts` — global scaffold (in code, ADR-0006) + Guidelines + QA Samples + retrieved chunks.
- ✅ Strict-grounding / graceful-refusal instruction encoded (ADR-0005): no context → decline in voice, never general knowledge.
- ⬜ Live verification (needs OpenAI quota to embed).

Done when: for the seeded client, in-KB questions assemble grounded prompts and out-of-KB questions assemble a decline-path prompt.

### Phase 4 — Chat route + streaming + persistence 🔨 (governs: ADR-0001)

Goal: the core end-to-end request, testable before auth hardening.

- ✅ `src/app/api/chat/route.ts` accepts `conversationId` (nullable) + the new message.
- ✅ Null `conversationId` → mint an unguessable id via the seam; returned in `x-conversation-id` header.
- ✅ Load prior messages (server-authoritative), retrieve + assemble (Phase 3), `streamText` with Sonnet 4.6 (no extended thinking), stream via `toTextStreamResponse`.
- ✅ Persist the new user message before generating and the assistant message on finish.
- ⬜ Live E2E verification (needs OpenAI quota + an ingested KB). `clientId` still from the body — Phase 5 swaps in API-key resolution.

Done when: a scripted client holds a multi-turn, grounded, streamed conversation whose full history lives in the DB.

### Phase 5 — Auth + abuse defense 🔨 (governs: ADR-0002)

Goal: harden the request path.

- ✅ Bearer API-key validation: `key_prefix` lookup + constant-time SHA-256 compare, no bcrypt (`src/lib/api-key.ts`, `src/lib/auth.ts`). Key minting via `npm run mint-key`.
- ✅ Resolve `client_id` from the key (cross-client lookup in auth, then everything flows through the seam).
- ✅ Domain whitelist + CORS: disallowed `Origin` → 403 with no CORS grant; preflight handled. **Verified end-to-end** (401/403/204/pass matrix).
- ⬜ Per-client usage metering (tokens) + cap/kill-switch — needs migration `0002_usage.sql` applied, then seam + route wiring. (Per-minute rate limiting via Upstash stays deferred.)

Done when: a request is bound to exactly one client, off-domain browser use is rejected (done), and per-client usage is metered with an enforceable cap.

### Phase 6 — Observability 🔨 (spec: Langfuse tracing)

Goal: every chat request is traceable end-to-end.

- ✅ Wire tracing through the **AI SDK v7 → Langfuse** integration: `@vercel/otel` `registerOTel({ spanProcessors: [LangfuseSpanProcessor] })` + `registerTelemetry(new LangfuseVercelAiSdkIntegration())` in `src/instrumentation.ts`, `telemetry` on `streamText`. The legacy `langfuse-vercel` `LangfuseExporter` predates the v7 span format and silently dropped spans — replaced with `@langfuse/otel` + `@langfuse/vercel-ai-sdk`.
- ✅ Verified live: a production chat request produced a Langfuse trace (`us.cloud.langfuse.com`, `environment: production`) with observations, token cost, and latency captured. Flush handled by `@vercel/otel` request-draining (no manual `forceFlush`).
- ✅ Per-client/conversation trace attribution via `@langfuse/tracing` `propagateAttributes` (wrapping the `streamText` call in `src/app/api/chat/route.ts`): `sessionId` = `conversationId` (one Langfuse session per chat, for per-session aggregation), `userId` = `clientId` (tenant = billable/analytical unit → per-client Langfuse dashboards), `traceName` = `"chat"`, plus `tags: ["client:<name>"]` and `metadata: {clientId, clientName}`. Verified live: a two-turn conversation produced two traces grouped under one session with all attributes set and token cost captured.
- ⬜ Log IP + full request info per message for transcript analysis (not yet built).

Done when: a completed chat produces a Langfuse trace showing the full pipeline for the right client.

### Phase 7 — The Widget 🔨 (governs: ADR-0002, ADR-0001)

Goal: the Exactly-built chat UI clients embed.

- ✅ Demo chat UI at `/demo` — streams the text response, sends `conversationId` + message (server-authoritative protocol), persists key + `conversationId` in localStorage (resume door open, ADR-0001).
- ✅ Per-client opening: `widget_config` (bubbles + chips, migration `0004`) served by `GET /api/chat/config`; demo renders opening bubbles + clickable chips. HFA opening configured to its spec.
- ⬜ Package as an embeddable widget/script for client sites (`/demo` is an in-app harness, not yet a drop-in embed).
- ⬜ Polish (styling to spec, error states, typing indicator).

**HFA conformance (client config, not code):** the HFA chatbot is configured to `kb/hfa_chatbot_spec.pdf` via per-client data — Guidelines (operating guide: judgment-not-capture, ≤2-sentence bubbles, observation-first, one-interpretation, resist comprehensiveness/urgency, not-a-fit, handoff), QA Samples (the 5 canonicals), KB (facts only), and `widget.json` (opening + chips). Source files under `client-config/howorth-francis/`; loaded via `npm run set-config`. Behavior verified live.

Done when: the widget can be dropped onto a whitelisted page and hold a grounded, streamed conversation against production.

### Phase 8 — Seed the launch client (manual) ⬜

Goal: stand up the one launch client, by hand.

- ⬜ Manually create the Client row, mint an API key, set the Domain Whitelist, and load its Guidelines + QA Samples (Supabase dashboard / seed scripts).
- ⬜ Run Phase 2 ingestion for that client's Knowledge Base.
- ⬜ Write down the exact manual steps, so seeding is repeatable even before there is tooling.

Done when: the single launch client is fully configured and answering grounded questions in its voice.

An admin portal for managing chat agents, keys, and config across many clients is **deferred** (see below).

---

## Deferred — Post-launch 🕓

Explicitly out of scope for launch; the architecture leaves room for each without a rewrite.

- 🕓 Per-minute rate limiting via Upstash Redis (per-client cap is sufficient to launch — ADR-0002).
- 🕓 Retention window / scheduled purge and per-end-user deletion (addressability already exists — ADR-0007).
- 🕓 Resume-a-conversation-from-a-link (design already accommodates it — ADR-0001).
- 🕓 Admin portal for managing chat agents, keys, Domain Whitelists, Guidelines, and QA Samples across clients (manual management is fine at the current client count).
- 🕓 Self-serve client ingestion / upload UI (ingestion stays Exactly-operated and offline for now).
- 🕓 Incremental per-document KB upsert (full-replace is fine until a KB is large enough to make re-embedding annoying).
- 🕓 Langfuse prompt management for the global scaffold (scaffold stays in code — ADR-0006).
- 🕓 Internal, PII-handling chatbots (a different product; retention/redaction/PII policy must be revisited first — ADR-0007).
