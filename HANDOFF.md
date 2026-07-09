# Handoff / pick-up — Howorth Francis chatbot

Status snapshot for resuming. Last updated at the point of handing the API to the client's web designer.

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

## 3. Deployment facts

- **Production API:** `https://exactly-chat.vercel.app` (Vercel project `matthew-morales-projects/exactly-chat`).
- **Env vars:** set on Vercel for production + preview (Anthropic, OpenAI, Supabase, Langfuse).
- **Redeploy after code changes:** `npx vercel --prod`. Config/origin changes need **no** redeploy (read live from Supabase).

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
- **Langfuse tracing is live** (`us.cloud.langfuse.com`). Wired via the AI SDK v7 integration (`@langfuse/otel` + `@langfuse/vercel-ai-sdk` in `src/instrumentation.ts`) — the older `langfuse-vercel` exporter didn't understand v7 spans and produced no traces. Verified: production chats appear as traces with token cost + latency.

## 6. Sensible next steps

- Whitelist the designer's origins (§2).
- (When ready) wire real handoff email delivery.
- (When ready) package the embeddable widget script (right now `/demo` is an in-app reference, not a drop-in embed).
- (When credits return) switch to embeddings retrieval.

See `ROADMAP.md` for the full phase-by-phase status.
