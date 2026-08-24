# Handoff / pick-up — Exactly Chat (Howorth Francis + Comm-Fit + SAS Conserve)

Status snapshot for resuming.
Three clients are provisioned: **Howorth Francis** (live, in client review), **Comm-Fit** (provisioned 2026-07-17), and **SAS Conserve** (provisioned 2026-07-24).
Sections 1–6 below are Howorth-Francis-specific unless noted; Comm-Fit's identifiers and state live in §4 and §7, SAS Conserve's in §4 and §8.

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
- **Client — SAS Conserve:** UUID `22accbc6-e1a3-4082-8e58-81bd8b18fed9` (see §8)
  - Source files: `client-config/sasconserve/{guidelines.md, qa-samples.md, widget.json}`; KB: `kb/sasconserve/sas_conserve_kb_v0.1.md`
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
- **Mirror Chatbot Doctrine v1.1 — in-frame conformance applied + verified live 2026-07-30.** Sources: `kb/hfa/Mirror Chatbot Doctrine v1.1-2.pdf` + `Mirror Chatbot Checklist v1.1-2.pdf` (internal — NOT bot grounding). Scope was explicitly chosen: **HFA-only, isolated** (no shared-code or Comm-Fit/SAS changes) and **in-frame conformance only** (the meta/two-doors/close + Exactly-side KB + pricing are **deferred**, per the doctrine's own Open Decisions 2 & 4: the Exactly-side KB asset doesn't exist and pricing numbers are pending Deb).
  - **Config changes (tracked):** `guidelines.md` gained explicit form governance (word caps 30–80/120, enumeration cap ≤2 then narrow, one question per turn at the end, no warmup openers), the no-scholarly-stacking cap (one credibility fact per response), enumerated anti-fabrication, temporal honesty (no date is injected → own the gap, never state a span measured from now), the comparative-claims guardrail, published-vs-committed, the nag anti-pattern (one offer then let go), land-the-outcome (P13), never-re-ask (P18), and chips-are-invitations (P16). `qa-samples.md` fixed four enumeration-cap breaks (3–4 options → ≤2), three glance-test em-dash bubbles, and the founders-bio credibility stacking.
  - **KB change (gitignored `kb/hfa/howorth_francis_kb_v1.8.md`, pushed live via `set-config --kb`):** added a **delivery-discipline block at Part A3** (founder credentials) and softened the B9 line that licensed a "full detail" dump — the root cause of persistent scholarly-stacking (in full-KB mode the scaffold tells the model the KB is its single source of truth, so it recited the A3 credential bundle). No facts removed; only rationing added.
  - **Verified live E2E (10 probes, all pass):** enumeration/word-cap; no stacking on founders bio even under "give me everything" pressure (the stubborn one — took the A3/B9 KB fix, not just guideline wording); temporal-honesty defer on founding date; anti-fabrication on a success-rate % with no stat-substitution; range-aware pricing with cancellation terms not volunteered; ICF deflection; remote/video deflection; NO_REC recruiting decline; nag anti-pattern (decline accepted in one breath, no re-push); and **meta correctly ABSENT** — "what is Exactly / how much does a bot cost" holds strictly to HFA with no step-out (confirms the deferral held).
  - **What conformance still needs (blocked, not started):** the shared prompt scaffold hardcodes single-domain ("customer-facing chat assistant for {clientName}… stay strictly on {clientName}") and injects no current date — both must change for the meta + a code-level temporal source; an **Exactly-side KB** must be authored; **Deb's pricing numbers** (monthly figure + disqualifier thresholds) must land before a real self-serve close. The doctrine is the reusable base for *all* mirrors — Comm-Fit/SAS would follow the same pattern when swept in.
- **Prompt-discipline fixes (F-01…F-06) — all applied + verified live 2026-07-10.** F-03/F-04 were already clean; F-01/F-02/F-05/F-06 landed in `client-config/howorth-francis/{guidelines.md, qa-samples.md}` and were pushed via `set-config --guidelines --qa`:
  - **F-01** — dropped the "within a business day" SLA; send-off is now "Sent. One of them will get back to you personally."
  - **F-02** — fit is described qualitatively (does a leadership team exist?), no headcount number.
  - **F-05** — Rod's ICF membership/level is deflected entirely to the founders (also removed a QA example that wrongly asserted "ICF-accredited").
  - **F-06** — remote/video questions defer to the founders instead of answering "onsite or offsite."
- **Remaining KB placeholders (bot won't assert these):** real photos and the "Field Notes" blog pieces (`blog.html` shell only). Pricing is no longer a placeholder — it's founder-locked range-aware as of v1.8. Fill remaining values into `kb/howorth_francis_kb_v1.8.md` and re-run `set-config --kb` when Charlotte/Rod confirm.
- **Booking-intent signal (the Calendly cue) — LIVE for HFA as of 2026-08-24 (code deployed to prod + HFA `widget_config.scheduler` switched on; now testing the Calendly embed end-to-end with the designer).** The mechanism (ADR-worthy, cross-cutting code): the mirror bot — the only party that knows a booking has landed, since it makes the offer — emits a single control token `[[SCHEDULE_MEETING]]` on the final line of its reply *only* when the visitor has agreed to book. It rides in-band on the existing plain-text stream (no wire-protocol change for any widget); the consuming widget strips it and renders the scheduler embed on that cue. Detection is single-owned on our side, killing the two-detectors-disagree problem (a client-side "cost/pricing" regex opening the scheduler under a pricing answer).
  - **Code (deployed to prod 2026-08-24; gated by config — inert for Comm-Fit and SAS Conserve until each is switched on):** new `src/lib/scheduler.ts` (canonical token + `stripScheduleToken` / `stripScheduleTokenForDisplay` / `hasScheduleToken` + the producer instruction); `buildSystemPrompt` injects the instruction only when `client.scheduler.enabled`; the chat route strips the token before persistence (history/analytics stay clean) and the `/api/chat/config` endpoint advertises `scheduler`; `/demo` is the reference consumer (strips the token, buffers the streaming tail, marks where the embed renders). Gate lives in `widget_config.scheduler = { enabled, provider }` (jsonb, live-read, **no migration**).
  - **HFA config wiring (live as of 2026-08-24):** `client-config/howorth-francis/guidelines.md` "meeting moment" now presents the in-chat scheduler on a clear yes-to-book (email hand-off stays as the "rather be contacted" path); `widget.json` gained `scheduler.enabled:true`, and both were `set-config`'d to HFA's live row. The designer's token-stripping widget is already live on `xa-mirror-howorth-francis.vercel.app`, so visitors never see the raw `[[SCHEDULE_MEETING]]`.
  - **Verified E2E against an isolated throwaway test client (HFA config + scheduler on; never touched HFA's live bot; client since deleted):** token fires on booking agreement (alone on the final line); does NOT fire on a pricing question, on the bot merely offering, on a still-deciding visitor, or on the "just email me" path; and the token is stripped from persisted history. Helper strip/display-buffer units pass.
  - **Contract handed to the designer:** `docs/integration/howorth-francis-chat-api.md` §5 and the standalone, client-agnostic `docs/integration/scheduler-cue.md` (strip the token, buffer the split-chunk tail, render on the cue, remove any client-side detection). Rollout, all done as of 2026-08-24: (1) code deployed to prod, (2) designer's widget strip + embed live on the HFA site, (3) HFA `widget_config.scheduler.enabled` flipped on (instant, no redeploy) — end-to-end Calendly-embed testing now in progress.
- **Langfuse tracing is live** (`us.cloud.langfuse.com`). Wired via the AI SDK v7 integration (`@langfuse/otel` + `@langfuse/vercel-ai-sdk` in `src/instrumentation.ts`) — the older `langfuse-vercel` exporter didn't understand v7 spans and produced no traces. Attribution set in `src/app/api/chat/route.ts` via `@langfuse/tracing` `propagateAttributes`: `sessionId` = `conversationId` (one session per chat), `userId` = `clientId` (per-client dashboards), `traceName` = `"chat"`, tags/metadata for the client. Verified live: two-turn conversation grouped under one session with token cost + latency.

## 6. What's next

The consolidated, prioritized forward plan now lives in [`WHATS-NEXT.md`](WHATS-NEXT.md) — the single source for "what would we do next."
It covers: finishing the Doctrine v1.1 meta layer for HFA (Exactly-side KB, Deb's pricing numbers, the shared-scaffold change, wiring the two doors + two-lane close, the full checklist review); making the doctrine the shared base across all mirrors; platform hardening (usage metering + cap/kill-switch, real handoff-email delivery, embeddings switch, widget packaging, request/session logging); per-client KB fill-ins; and ops housekeeping.

See `ROADMAP.md` for the full phase-by-phase history.

## 7. Comm-Fit — second client (provisioned 2026-07-17)

Turnkey commercial-fitness-facility provider (Addison, TX). Same interim `full-kb` mode, `claude-sonnet-4-6`, per-client config in Supabase — no code path is client-specific.

- **UUID:** `e18a30df-d55d-4514-905c-50725f7dc9d0`
- **API key** (publishable; shown once at mint — regenerate with `mint-key` if lost):
  ```
  eck_b95a55bf585d01f5_IfT83IB_N7-kVUln08ZEqgjep-P806LH
  ```
- **Whitelisted origins:** see the full current list below; `checkOrigin` does an exact match against the browser's slash-less `Origin` header, so trailing slashes are stored stripped. Add more with `set-config --origins` (replaces the whole list, so include the existing ones).
- **Config (tracked):** `client-config/comm-fit/{guidelines.md, qa-samples.md, widget.json}`. **KB (gitignored):** `kb/comm-fit/comm_fit_kb_v0.1.md` (six-layer structure: identity/ICP · pillar feature map · FAQ library · conversion triggers · objection handling · differentiators). qa_samples finalized from the client's canonical Q&A (20 pairs).
- **Provisioning flow used:** `create-client` (new script) → `set-config --guidelines --qa --kb --widget` → `mint-key`.
- **Verified live end-to-end** (production, whitelisted origin): identity/what-we-do, pillar routing (a "Flooring" chip loads only that pillar + a qualifying follow-up), the electrostatic-spray KB facts, and the widget-config endpoint (bubbles + 6 chips). **Anti-hallucination holds:** a per-sq-ft flooring price and an employee-count/CFO ask both refuse to invent and route to a quote / name only CEO Seth Gordon. Origin gate confirmed (foreign origin → 403, whitelisted → 200).
- **Central discipline (baked into guidelines + KB):** the KB is the sole source of truth. The only firm published price is "service calls start at $125"; every other number defers to a quote. Never invent specs, prices, dates, models, warranty terms, competitor names, or people beyond Seth Gordon. Surface `1-877-479-4444` near a decision.
- **Integration guide:** [`docs/integration/comm-fit-chat-api.md`](docs/integration/comm-fit-chat-api.md) — self-contained (base URL, auth, whitelist, endpoints, streaming, errors, copy-paste JS, behaviour notes). Send as-is to Comm-Fit's designer.
- **Whitelisted origins:** `https://comm-fit-concierge.vercel.app`, `http://localhost:3000` (local dev, added 2026-07-17), and `https://comm-fit-clone-v2.vercel.app` (added 2026-08-03; input had a trailing slash — stored slash-less). The hosted `/demo` (origin `https://exactly-chat.vercel.app`) is **not** enabled for the Comm-Fit key; add it with `set-config --origins` if wanted (the guide's §8 flags this).
- **Mirror Chatbot Doctrine v1.1 — in-frame conformance applied + verified live 2026-08-03.** Same scope decision as HFA: **Comm-Fit-only, in-frame conformance only** (the meta/two-doors/close is deferred platform-wide — Exactly-side KB doesn't exist and pricing numbers are pending Deb, per the doctrine's own Open Decisions 2 & 4). `guidelines.md` and `qa-samples.md` were rewritten from the original funnel-style config (200-word answers, "move them toward a quote or call", Contact-form routing, six-fact differentiator stacking) into doctrine posture: word caps 30–80/120, two-short-sentences-per-bubble, one question per turn, enumeration cap ≤2, chips-are-invitations, observation-before-interpretation with one hypothesis at a time, never-re-ask, land-don't-linger, one-offer-then-let-go, pitch rationing (≤2 offers), NO_REC as a first-class not-a-fit (residential/out-of-scale, Peloton, out-of-scope), the **demonstrated-conversion handoff replacing all form routing** (collect space facts + contact conversationally → synthesize brief → confirm → "Sent — a rep will follow up"), enumerated anti-fabrication, one-credibility-fact-per-response (no scholarly stacking), temporal honesty (state founding year 1996, never a span from "now"), honest-defer-is-the-whole-answer (no stat substitution), comparative-claims-only-about-visible-practice, and no-dead-ends. qa-samples converted from 20 canned FAQ answers into 8 conversation exemplars demonstrating the postures.
  - **Verified live E2E (7 probes, all pass)** from the new `comm-fit-clone-v2` origin: price honest-defer (no invented per-sq-ft, no stat substitution); no scholarly stacking on "why Comm-Fit" (one turnkey anchor); NO_REC residential decline (no conversion attempt); no-form demonstrated handoff on "how do I get a quote"; temporal honesty ("founded in 1996", no span); Peloton scope + comparative restraint; and **meta correctly ABSENT** — "is this made by Exactly / what does a bot cost" holds strictly to Comm-Fit with a clean refusal + redirect (confirms the deferral held).
- **Open items:** KB is v0.1 (public-facts only — no client-supplied pricing tiers, named case studies, or warranty terms yet).

## 8. SAS Conserve — third client (provisioned 2026-07-24)

Sustainability Solutions ("SAS"), "Experts in Water Savings" — a water-conservation fixture-retrofit provider (Flower Mound, TX) that installs ultra-high-efficiency toilets, showerheads, and aerators as a turnkey audit-to-savings program. Same interim `full-kb` mode, `claude-sonnet-4-6`, per-client config in Supabase — no code path is client-specific.

- **UUID:** `22accbc6-e1a3-4082-8e58-81bd8b18fed9`
- **API key** (publishable; shown once at mint — regenerate with `mint-key` if lost):
  ```
  eck_9fc3d301a78e6557_39Vn5zLkzXhnixlzTuCfC7uA5WqjzC9V
  ```
- **Whitelisted origins:** `https://sas-conserve-clone.vercel.app` (client clone site, added 2026-07-24; input had a trailing slash — stored slash-less for the exact-match `checkOrigin`) and `http://localhost:3000` (dev default). Add more with `set-config --origins` (replaces the whole list). The hosted `/demo` (`https://exactly-chat.vercel.app`) is **not** enabled for this key; the guide's §8 flags this.
- **Config (tracked):** `client-config/sasconserve/{guidelines.md, qa-samples.md, widget.json}`. **KB (gitignored):** `kb/sasconserve/sas_conserve_kb_v0.1.md` (six-layer structure: ICP qualifier · ICP-matched feature map · FAQ library · product reference · conversion triggers/objections · proof/case studies). The KB is already fully citation-bound with inline `(src: …)` pointers and an explicit anti-hallucination/UNVERIFIED discipline baked in by its author — the guidelines mirror that discipline.
- **Provisioning flow used:** `create-client` → `set-config --guidelines --qa --kb --widget` → `mint-key` → `set-config --origins`.
- **Verified live end-to-end** (production, whitelisted origin): config endpoint (bubbles + 5 chips), identity/what-we-do, multifamily segment routing (owner-vs-PM split + NOI/ROI framing), and off-topic decline. **Anti-hallucination holds:** a per-unit price ask routes to a free audit with no invented figure; the warranty ask correctly refuses a single number and cites the 15-vs-20-year site conflict → defers to the quote; a service-area/"nationwide?" ask claims no coverage beyond confirming logistics on request; a leadership ask names only founder Jeffrey Phillips. Origin gate confirmed (foreign origin → 403, whitelisted → 200).
- **Central discipline (baked into guidelines + KB):** the KB is the sole source of truth. **SAS publishes no prices** — every "how much cost / how much savings" routes to a free water usage audit; self-reported figures are used verbatim and framed as reported results, not guarantees. Never assert a single warranty term (15 vs 20 conflict → defer to quote), never claim a service area beyond Flower Mound TX, never claim company-level certifications (only the aerator's WaterSense is confirmed), never name anyone but founder Jeffrey Phillips, and never invent an email (none is published — use the Contact form or `(888) 657-7582`).
- **Integration guide:** [`docs/integration/sasconserve-chat-api.md`](docs/integration/sasconserve-chat-api.md) — self-contained (base URL, auth, whitelist, endpoints, streaming, errors, copy-paste JS, behaviour notes). Send as-is to SAS Conserve's designer.
- **Open items:** KB is v0.1 (public-facts only). Thin/missing topics flagged in the KB's own "Thin / Missing Topics" section — pricing/cost structure (none published), service area beyond TX HQ, product spec bodies, warranty-term reconciliation, company-level certifications, contact email, and rebate details. Fill and re-run `set-config --kb` when the client supplies them. Client clone origin (`https://sas-conserve-clone.vercel.app`) is whitelisted; real staging/production origins still to come.
