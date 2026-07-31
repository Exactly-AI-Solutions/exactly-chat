# What's next — Exactly Chat

The consolidated, prioritized forward plan.
This is the single source for "what would we do next"; `HANDOFF.md` covers current state, `ROADMAP.md` covers phase-by-phase history.
Last updated 2026-07-30.

Three clients are live: **Howorth Francis** (in client review), **Comm-Fit**, and **SAS Conserve** — all on the interim `full-kb` mode, same per-client config architecture, no client-specific code.
HFA was brought into **in-frame** conformance with Mirror Chatbot Doctrine v1.1 on 2026-07-30; the meta layer was deliberately deferred (see item 1).

Items are grouped by theme and ordered roughly by priority within each.
Each notes what it is, why it matters, and what it's blocked on.

---

## 1. Finish what Doctrine v1.1 started — the HFA meta layer

This is the largest and highest-value chunk.
HFA currently conforms to the doctrine's universal principles *in-frame* (the demonstration), but the **meta** — the bot answering about itself and about Exactly, and the two-lane close — is not built.
The doctrine flags most of this as not-yet-built (its own Open Decisions 2 & 4), so the work is sequenced by dependency:

1. **Author the Exactly-side KB** (doctrine Open Decision 4 — the gating build dependency).
   What Exactly is, how mirrors work, what going live involves, and the sanctioned answers to the artifact-curiosity questions.
   Same class of work as a client KB, pointed at ourselves; built once, shipped with every mirror.
   Draftable now from the doctrine itself — this is the first thing to do and it unblocks everything else in this section.

2. **Get the pricing numbers from Deb** (doctrine Open Decision 2 — external blocker).
   The structure is known and can be stated now (build fee starts at $5,000, monthly managed service, 3-month initial evaluation-and-optimization term then month-to-month, LLM usage billed separately).
   The **monthly figure** and the **scope-disqualifier thresholds** are pending Deb; a real self-serve purchase can't complete on invented numbers.
   Until they land, the bot states structure and honest-defers the unlocked figures.

3. **Change the shared prompt scaffold** (`src/lib/prompt.ts` — cross-cutting code, affects all three bots).
   Today it hardcodes single-domain framing ("customer-facing chat assistant for {clientName}… stay strictly on {clientName}"), which forbids the meta, and it injects no current date.
   Needs: two-domain scope (prospect business + chatbot/Exactly, never refusing Exactly questions), cross-KB isolation framing, and an **injected current date** (this is also the proper fix for temporal honesty, currently handled by config work-around on HFA).
   Decide the architecture here too — see item 2.

4. **Wire HFA's meta behavior** (per-client config, once 1–3 exist).
   The two doors (artifact-curiosity → answer, no pitch; buying-signal → answer + the close), silent posture-switching, M1's once-per-session sign-off invitation with the two locked CWA reveals, the two-lane close (self-serve purchase / booked conversation) with the scope disqualifier, and a formal **Decision Contract** (approved outcome set, required evidence, disqualifiers, NO_REC path, Business Objective).

5. **Run the full v1.1 checklist as a real review** (human sign-off).
   The build/review checklist is graded PASS/PARTIAL/FAIL by named lanes (voice/register, eval, fact-verification) and includes the two-minute reviewer test and the adversarial probes (pounce, unprompted-pivot, evidence-before-hypothesis, re-ask, no-forms sweep).
   The E2E probing done on 2026-07-30 covered the in-frame gates; the per-lane sign-off and two-minute test are human steps still owed.

---

## 2. Make the doctrine the shared base for all mirrors

The doctrine is explicitly the reusable base for *every* mirror ("adapt, don't redesign"), but the 2026-07-30 work was scoped HFA-only and isolated.
Two decisions remain, best made together with item 1.3:

- **Where the doctrine lives.**
  Per-client guidelines (isolated, but duplicated for each new mirror) vs. a shared "mirror scaffold" layer in code that every mirror inherits (matches the doctrine's intent, less drift).
  The shared-layer path is the maintainable one and pairs naturally with the item 1.3 scaffold change.
- **Sweep Comm-Fit and SAS Conserve in.**
  Both are mirror-style deployments and would follow the same in-frame + meta pattern.
  Once the shared base exists, bringing them to conformance is adaptation, not a rebuild.

---

## 3. Platform hardening

Infra work that isn't client-specific; mostly independent of items 1–2.

- **Per-client usage metering + cap/kill-switch** (ROADMAP Phase 5, recommended next infra item).
  Migration `0002_usage.sql` is applied; remaining work is wiring `increment_usage` through the data seam + chat route (count tokens from the stream result, enforce the monthly cap → clean 429).
  Business-critical for usage billing; no external dependency.
- **Wire real handoff email delivery.**
  The bot demonstrates the handoff (collects context, synthesizes the brief, says "Sent") but no email is actually delivered.
  Required before any client relies on live leads.
  Note: this is the *in-frame demonstrated* handoff — under the doctrine, the mirror's handoff stays demonstrated; real delivery matters for production/paid bots.
- **Switch to embeddings retrieval** when OpenAI credits return.
  Flip `config.retrieval.mode` to `"embeddings"`, run `npm run ingest`, redeploy.
  The embeddings path is already built; behaviour is identical to the designer.
- **Package the embeddable widget script.**
  Today `/demo` is an in-app reference, not a drop-in embed a client can paste onto their site.
- **Log IP + full request info per message** (ROADMAP Phase 6) for transcript analysis, plus per-doctrine **session capture** (transcript, counts, referrer, per-prospect roll-up as an account-level engagement signal).

---

## 4. Content fill-ins (per client)

Each client's KB is early; these are the known gaps to close as clients supply material (config-only, no code).

- **Howorth Francis** — real photos and the "Field Notes" blog pieces are still placeholders (`blog.html` shell only); the bot won't assert them.
  Pricing is founder-locked range-aware (v1.8) and no longer a placeholder.
- **Comm-Fit** — KB is v0.1 (public-facts only): no client-supplied pricing tiers, named case studies, or warranty terms yet.
- **SAS Conserve** — KB is v0.1; the KB's own "Thin / Missing Topics" section lists the gaps: pricing/cost structure, service-area/geographic coverage, product spec bodies, the 15-vs-20-year warranty reconciliation, company-level certifications, a contact email, and rebate details.

---

## 5. Housekeeping / ops

- **Whitelist remaining client origins** as designers provide them (instant, no redeploy; `--origins` replaces the whole list, so include existing ones).
  Optionally enable the `exactly-chat.vercel.app` demo origin per client key if they want the hosted `/demo` to work with their key.
- **Push-to-deploy** is deliberately not wired (needs Vercel Pro for an org-owned repo); revisit if/when on a Pro Team. Until then, code changes deploy manually via `npx vercel --prod`.
- **Reflection loop / learning from outcomes** remains deferred (per doctrine); mirrors are the corpus that will eventually train it, and no learned change touches a live mirror without human approval.
