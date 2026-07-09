# Handoff / pick-up — Howorth Francis chatbot

Status snapshot for resuming. Last updated after wiring Langfuse tracing (with per-client/session attribution) and putting the code under source control on GitHub.

---

## 1. What to send the designer (ready now)

Both together let them integrate and test:

- **Integration guide:** [`docs/integration/howorth-francis-chat-api.md`](docs/integration/howorth-francis-chat-api.md) — self-contained (base URL, auth, endpoints, streaming, errors, a copy-paste JS example). Send this file as-is.
- **API key** (publishable — safe in front-end code):
  ```
  eck_5951a823ff14c36e_0SEvjCecH5swi1aA_--w6BJXYE3pOPhL
  ```
- **Live reference UI to show them:** `https://exactly-chat.vercel.app/demo` (paste the key).

The integration doc already contains the URL, the key, and examples — sending that one file is enough.

## 2. The one open action before the designer can test

Their browser origin must be whitelisted or the API returns **403**.

- Already whitelisted: `http://localhost:3000`, `https://exactly-chat.vercel.app`, `https://xa-mirror-howorth-francis.vercel.app` (designer's demo site, verified live).
- **Get the designer's remaining origin(s)** — local dev URL (e.g. `http://localhost:5173`), staging, and the production site — then add them (instant, no redeploy):
  ```
  npm run set-config -- --client e7580eab-0a93-4bd4-875f-7e751cb25d4b \
    --origins "http://localhost:3000,https://exactly-chat.vercel.app,https://xa-mirror-howorth-francis.vercel.app,<designer-dev>,<staging>,<prod>"
  ```
  `--origins` **replaces** the whole list, so include the existing ones too.

## 3. Deployment & source control facts

- **Source:** `https://github.com/Exactly-AI-Solutions/exactly-chat` (private, org-owned). `main` branch. Push over **HTTPS** using the `gh` token as git credential helper (`gh auth setup-git` already run) — SSH isn't set up in this environment. `.env`, `/kb`, and `.vercel` are gitignored.
- **Production API:** `https://exactly-chat.vercel.app` (Vercel project `matthew-morales-projects/exactly-chat`).
- **Env vars:** set on Vercel for production + preview (Anthropic, OpenAI, Supabase, Langfuse).
- **Redeploy after code changes:** `npx vercel --prod` (manual). Config/origin changes need **no** redeploy (read live from Supabase).
- **Push-to-deploy is NOT wired** (deliberately): Vercel auto-deploy from this repo needs **Pro** — the repo is org-owned (Hobby can't auto-deploy org repos) and this is commercial use. Revisit if/when on a Vercel Pro Team; until then, deploy manually.

## 4. Key identifiers & commands

- **Client:** Howorth Francis — UUID `e7580eab-0a93-4bd4-875f-7e751cb25d4b`
- **Mint another key:** `npm run mint-key -- --client <uuid>`
- **Update guidelines / QA / KB / opening / origins:** `npm run set-config -- --client <uuid> [--guidelines f] [--qa f] [--kb f] [--widget f] [--origins csv]`
  - HFA source files: `client-config/howorth-francis/{guidelines.md, qa-samples.md, widget.json}`; facts KB: `kb/howorth_francis_kb_v1.4.md`
- **DB migrations applied:** `0001`–`0004` (schema, usage, KB-text, widget config).

## 5. State notes (so nothing surprises you)

- **Interim mode:** `config.retrieval.mode = "full-kb"` — the whole KB is in the prompt, no OpenAI. Behaviour is identical for the designer. When OpenAI credits return: switch to `"embeddings"`, run `npm run ingest`, redeploy. (ADR-0008.)
- **Chatbot conforms to the spec** (`kb/hfa_chatbot_spec.pdf`) via per-client config — Guidelines + QA Samples + KB + opening bubbles/chips. Verified live.
- **Handoff email is not wired.** The bot collects name/company/role/email conversationally and shows the "Here's what I'm sending Rod and Charlotte… Sound right?" synthesis, then says "Sent" — but no email is actually delivered. Wire real delivery before the client relies on live leads.
- **KB placeholders:** pricing (`[$X]`) and a few facts are `[UNVERIFIED]`/`[PLACEHOLDER]`; the bot won't assert them. Fill real values into `kb/howorth_francis_kb_v1.4.md` and re-run `set-config --kb` when Charlotte/Rod confirm.
- **Langfuse tracing is live** (`us.cloud.langfuse.com`). Wired via the AI SDK v7 integration (`@langfuse/otel` + `@langfuse/vercel-ai-sdk` in `src/instrumentation.ts`) — the older `langfuse-vercel` exporter didn't understand v7 spans and produced no traces. Attribution set in `src/app/api/chat/route.ts` via `@langfuse/tracing` `propagateAttributes`: `sessionId` = `conversationId` (one session per chat), `userId` = `clientId` (per-client dashboards), `traceName` = `"chat"`, tags/metadata for the client. Verified live: two-turn conversation grouped under one session with token cost + latency.

## 6. Sensible next steps

- **Next up (recommended): per-client usage metering + cap/kill-switch** (ROADMAP Phase 5, last item). Migration `0002_usage.sql` is applied; remaining work is wiring `increment_usage` through the data seam + chat route (count tokens from the stream result, enforce the monthly cap → clean 429). Business-critical for usage billing; no external dependency.
- Log IP + full request info per message for transcript analysis (ROADMAP Phase 6).
- (As designer provides them) whitelist their remaining origins (§2).
- (When ready) wire real handoff email delivery.
- (When ready) package the embeddable widget script (right now `/demo` is an in-app reference, not a drop-in embed).
- (When credits return) switch to embeddings retrieval.

See `ROADMAP.md` for the full phase-by-phase status.
