# Handoff / pick-up — Exactly Chat (Howorth Francis + Comm-Fit)

Status snapshot for resuming.
Two clients are provisioned: **Howorth Francis** (live, in client review) and **Comm-Fit** (provisioned 2026-07-17).
Sections 1–6 below are Howorth-Francis-specific unless noted; Comm-Fit's identifiers and state live in §4 and §7.

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

- **Client — Howorth Francis:** UUID `e7580eab-0a93-4bd4-875f-7e751cb25d4b`
  - Source files: `client-config/howorth-francis/{guidelines.md, qa-samples.md, widget.json}`; facts KB: `kb/howorth_francis_kb_v1.8.md`
- **Client — Comm-Fit:** UUID `e18a30df-d55d-4514-905c-50725f7dc9d0` (see §7)
  - Source files: `client-config/comm-fit/{guidelines.md, qa-samples.md, widget.json}`; KB: `kb/comm-fit/comm_fit_kb_v0.1.md`
- **Create a client:** `npm run create-client -- --name "<name>" [--origins <csv>]` → prints the new UUID.
- **Mint a key:** `npm run mint-key -- --client <uuid>`
- **Update guidelines / QA / KB / widget / origins:** `npm run set-config -- --client <uuid> [--guidelines f] [--qa f] [--kb f] [--widget f] [--origins csv]`
- **DB migrations applied:** `0001`–`0004` (schema, usage, KB-text, widget config).

## 5. State notes (so nothing surprises you)

- **Interim mode:** `config.retrieval.mode = "full-kb"` — the whole KB is in the prompt, no OpenAI. Behaviour is identical for the designer. When OpenAI credits return: switch to `"embeddings"`, run `npm run ingest`, redeploy. (ADR-0008.)
- **Chatbot conforms to the spec** (`kb/hfa_chatbot_spec.pdf`) via per-client config — Guidelines + QA Samples + KB + opening bubbles/chips. Verified live.
- **Handoff email is not wired.** The bot collects name/company/role/email conversationally and shows the "Here's what I'm sending Rod and Charlotte… Sound right?" synthesis, then says "Sent" — but no email is actually delivered. Wire real delivery before the client relies on live leads.
- **KB is v1.8 (range-aware pricing), live.** Ingested via `set-config --kb kb/howorth_francis_kb_v1.8.md` on 2026-07-14; verified live end-to-end (5 pricing probes: team/coaching/keynote ranges assert correctly, firm-quote pressure refused, cancellation-terms question deflected without volunteering %s). Fix-list is 10/10 closed.
  - **v1.8 delta over v1.7 (pricing only — all other content byte-identical to v1.7):** pricing moved from **defer-only → range-aware**, founder-locked 2026-07-14 (Deb secured HFA approval; source sheet `kb/HFA CostsUPDATED-1.xlsx`, internal/gitignored — NOT bot grounding).
    The bot now states indicative **starting ranges** — Keynote $5–15k · 1:1 coaching $1.5–5k/mo retainer · Team $15–30k+ (3–6 mo) · Extended $30–75k+ (6–12 mo) — always framed as starting points, with the exact number still routed to a founder conversation.
    Guardrails intact: never a firm quote; never volunteer cancellation/refund/missed-session terms unprompted; never quote the founders' solo-practice pricing as HFA pricing. Full four-offer table + terms live in KB §A5.
    Config side (tracked): `guidelines.md` "Don't pre-anchor" bullet rewritten to the range-aware posture; `qa-samples.md` Example-1 pricing line flipped to range-then-defer and the not-a-fit `[$X]` placeholder filled ($15k).
  - v1.7 deltas over v1.6 (all content-level, single-file swap):
  - **95%** — primary wording unchanged ("cognitive scientists estimate… on the order of 95%"); the bot now names **Lakoff & Johnson** if asked *which* scientists (Gendlin stays as the change-methodology grounding).
  - **CHOICE™** — trademark restored per Deb; render "Leading with CHOICE™".
  - **BCG** — dropped the unsourced "85% attempted" half; line is now "around 70% of major transformations fail" (BCG). Old 85%-citation guardrail retired.
  - **Testimonials** — **Sergio Maclean** and **Ashley Kowal** permission confirmed; the bot may attribute + quote both. J&J stays anonymous until its permission lands.
  - Coaching-cost 50–200% (SHRM) unchanged.
  Mark's delta note lives at `kb/matthew_hfa_kb_v1.7_note_2026-07-10.md` (internal — NOT bot grounding).
- **Prompt-discipline fixes (F-01…F-06) — all applied + verified live 2026-07-10.** F-03/F-04 were already clean; F-01/F-02/F-05/F-06 landed in `client-config/howorth-francis/{guidelines.md, qa-samples.md}` and were pushed via `set-config --guidelines --qa`:
  - **F-01** — dropped the "within a business day" SLA; send-off is now "Sent. One of them will get back to you personally."
  - **F-02** — fit is described qualitatively (does a leadership team exist?), no headcount number.
  - **F-05** — Rod's ICF membership/level is deflected entirely to the founders (also removed a QA example that wrongly asserted "ICF-accredited").
  - **F-06** — remote/video questions defer to the founders instead of answering "onsite or offsite."
- **Remaining KB placeholders (bot won't assert these):** real photos and the "Field Notes" blog pieces (`blog.html` shell only). Pricing is no longer a placeholder — it's founder-locked range-aware as of v1.8. Fill remaining values into `kb/howorth_francis_kb_v1.8.md` and re-run `set-config --kb` when Charlotte/Rod confirm.
- **Langfuse tracing is live** (`us.cloud.langfuse.com`). Wired via the AI SDK v7 integration (`@langfuse/otel` + `@langfuse/vercel-ai-sdk` in `src/instrumentation.ts`) — the older `langfuse-vercel` exporter didn't understand v7 spans and produced no traces. Attribution set in `src/app/api/chat/route.ts` via `@langfuse/tracing` `propagateAttributes`: `sessionId` = `conversationId` (one session per chat), `userId` = `clientId` (per-client dashboards), `traceName` = `"chat"`, tags/metadata for the client. Verified live: two-turn conversation grouped under one session with token cost + latency.

## 6. Sensible next steps

- **Next up (recommended): per-client usage metering + cap/kill-switch** (ROADMAP Phase 5, last item). Migration `0002_usage.sql` is applied; remaining work is wiring `increment_usage` through the data seam + chat route (count tokens from the stream result, enforce the monthly cap → clean 429). Business-critical for usage billing; no external dependency.
- Log IP + full request info per message for transcript analysis (ROADMAP Phase 6).
- (As designer provides them) whitelist their remaining origins (§2).
- (When ready) wire real handoff email delivery.
- (When ready) package the embeddable widget script (right now `/demo` is an in-app reference, not a drop-in embed).
- (When credits return) switch to embeddings retrieval.

See `ROADMAP.md` for the full phase-by-phase status.

## 7. Comm-Fit — second client (provisioned 2026-07-17)

Turnkey commercial-fitness-facility provider (Addison, TX). Same interim `full-kb` mode, `claude-sonnet-4-6`, per-client config in Supabase — no code path is client-specific.

- **UUID:** `e18a30df-d55d-4514-905c-50725f7dc9d0`
- **API key** (publishable; shown once at mint — regenerate with `mint-key` if lost):
  ```
  eck_b95a55bf585d01f5_IfT83IB_N7-kVUln08ZEqgjep-P806LH
  ```
- **Whitelisted origin:** `https://comm-fit-concierge.vercel.app` (the only one so far; the input had a trailing slash — stored without it, since `checkOrigin` does an exact match against the browser's slash-less `Origin` header). Add more with `set-config --origins` (replaces the whole list).
- **Config (tracked):** `client-config/comm-fit/{guidelines.md, qa-samples.md, widget.json}`. **KB (gitignored):** `kb/comm-fit/comm_fit_kb_v0.1.md` (six-layer structure: identity/ICP · pillar feature map · FAQ library · conversion triggers · objection handling · differentiators). qa_samples finalized from the client's canonical Q&A (20 pairs).
- **Provisioning flow used:** `create-client` (new script) → `set-config --guidelines --qa --kb --widget` → `mint-key`.
- **Verified live end-to-end** (production, whitelisted origin): identity/what-we-do, pillar routing (a "Flooring" chip loads only that pillar + a qualifying follow-up), the electrostatic-spray KB facts, and the widget-config endpoint (bubbles + 6 chips). **Anti-hallucination holds:** a per-sq-ft flooring price and an employee-count/CFO ask both refuse to invent and route to a quote / name only CEO Seth Gordon. Origin gate confirmed (foreign origin → 403, whitelisted → 200).
- **Central discipline (baked into guidelines + KB):** the KB is the sole source of truth. The only firm published price is "service calls start at $125"; every other number defers to a quote. Never invent specs, prices, dates, models, warranty terms, competitor names, or people beyond Seth Gordon. Surface `1-877-479-4444` near a decision.
- **Integration guide:** [`docs/integration/comm-fit-chat-api.md`](docs/integration/comm-fit-chat-api.md) — self-contained (base URL, auth, whitelist, endpoints, streaming, errors, copy-paste JS, behaviour notes). Send as-is to Comm-Fit's designer.
- **Whitelisted origins:** `https://comm-fit-concierge.vercel.app` and `http://localhost:3000` (local dev, added 2026-07-17). The hosted `/demo` (origin `https://exactly-chat.vercel.app`) is **not** enabled for the Comm-Fit key; add it with `set-config --origins` if wanted (the guide's §8 flags this).
- **Open items:** KB is v0.1 (public-facts only — no client-supplied pricing tiers, named case studies, or warranty terms yet).
