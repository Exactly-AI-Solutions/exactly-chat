# Comm-Fit transcript critique — root-cause analysis

**Date:** 2026-08-27
**Client:** Comm-Fit (`e18a30df-d55d-4514-905c-50725f7dc9d0`)
**Source:** `kb/comm-fit/comm_fit_transcript_critique.md` — a client-supplied transcript with six numbered gripes.
**Status:** Remediated, **pushed to the live agent and verified E2E on 2026-08-27** (see [Verification results](#verification-results)).
**Companion:** [Full transcript replay — the client's own turns, before/after, turn by turn](comm-fit-transcript-replay-2026-08-27.md).

---

## Summary

Six complaints trace back to **four root causes**, none of which is a model failure.
In every case the bot did what its configuration told it to do.

The most consequential finding is that **the knowledge base was not just facts — it was a second, competing behaviour spec**, written in the pre-doctrine funnel style and injected wholesale into every prompt.
It instructed the bot to cap replies at ~200 words, to surface the phone number near any decision, and to *"Always offer the contact form or phone."*
Those instructions contradicted the doctrine guidelines directly, and on the evidence of this transcript they were winning.

| # | Gripe | Root cause |
| --- | --- | --- |
| 1 | Only 1 of 3 disinfection products named; jumped to pricing | RC-A + RC-B |
| 2 | Too pushy — assumed a quote was wanted | **RC-A** |
| 3 | Long answers not broken into paragraphs | **RC-C** |
| 4 | "Who's the primary user base?" asked with no stated reason | RC-E |
| 5 | Capabilities answer vague, unformatted, missing service and walkthrough | **RC-B** + RC-C |
| 6 | "Can I join your mailing list?" → "email us about that" | **RC-D** |

---

## How a Comm-Fit reply is assembled

Understanding the defects requires knowing what actually reaches the model.

`buildSystemPrompt` (`src/lib/prompt.ts:36`) concatenates four blocks in this fixed order:

1. A short global scaffold — grounding, graceful refusal, stay-on-client.
2. **Guidelines**, injected wholesale from the `guidelines` column.
3. **QA Samples**, injected wholesale from the `qa_samples` column.
4. **Knowledge base context**, last.

Because `config.retrieval.mode` is `"full-kb"` (`src/config/index.ts:56`), step 4 is not a set of retrieved passages.
It is the client's **entire** knowledge base, assigned directly at `src/app/api/chat/route.ts:83`:

```ts
// Interim full-KB mode (ADR-0008): the whole KB text, no embeddings.
context = client.knowledgeBase;
```

The relative weights matter.
These are the **live column values as they stood when the critiqued transcript was produced**, read back from Supabase before remediation:

| Block | Size | Share of the per-client prompt |
| --- | --- | --- |
| Guidelines | 12,894 chars | 25% |
| QA Samples | 6,896 chars | 14% |
| **Knowledge base** | **31,033 chars** | **61%** |

The knowledge base is **2.4× the size of the guidelines**, and it sits **last** — the closest text to the model's turn.
Any behavioural instruction inside it is not a footnote. It is the loudest voice in the prompt.

---

## RC-A — The knowledge base was a competing behaviour spec

This is the primary root cause and the one that produced the client's sharpest complaint (gripe 2).

`comm_fit_kb_v0.1.md` was authored from a CRO template that interleaves *facts* with *response scripts*.
The doctrine sweep of 2026-08-03 rewrote the **guidelines** into doctrine posture but never touched the **KB**, so the funnel-era instructions survived inside the largest block of the prompt.

### The evidence

Line 6, in the KB's own header, before a single fact:

> **Tone:** Warm, confident, direct, consultative. Keep responses tight (~200 words max). Surface the phone number `1-877-479-4444` whenever a visitor is close to a decision or has a time-sensitive question.

Layer 4 carried the title **"Conversion Triggers"** and this preamble:

> Moments where the bot shifts from answering to converting. **Always offer the contact form or phone.**

…followed by seven pre-written CTAs, including the two that map onto this transcript exactly:

> **Visitor asks about price / cost (any pillar)** — "Every project is priced to the space… Share your space details and we'll put together a custom quote. Fastest path is a call: 1-877-479-4444, or fill out our contact form."

> **Visitor describes a space / project** — "Sounds like a great fit for our turnkey approach — design, equipment, flooring, disinfection, and install from one team. Send us the dimensions and facility demographics and our sales rep will lay it out for you: 1-877-479-4444."

Layer 3's preamble and the Implementation Notes reinforced it:

> Each answer is written for conversational delivery and **ends with a next step**.

> **Layer 3** — Index as searchable Q&A pairs; **always append a quote/contact CTA**.

> **Max response length** — ~200 words. **Always surface 1-877-479-4444 near a decision point.**

Individual FAQ rows had the CTA baked into the fact itself:

> \| What does it cost per visit? \| It's based on square footage — **contact one of our sales experts for a quote: 1-877-479-4444**. \|

### Why this produced the observed behaviour

The guidelines said one thing:

> **Resist urgency.** You are not trying to book a call or capture an email.

The knowledge base, in 2.5× the volume and in the final position, said the opposite: *always offer*, *always append a CTA*, *surface the phone number near a decision*.

The transcript shows the KB winning on turn two.
The visitor had supplied a facility type and a square footage — which Layer 4 defines as *"Visitor describes a space / project"*, a conversion trigger — and the bot fired the scripted move:

> Pricing is based on square footage — want me to get a rep to put together an exact quote for you?

The visitor had not mentioned money.
That reply is a near-paraphrase of the Layer 3 cost row and the Layer 4 price trigger, delivered because the KB instructed it, at a moment the KB defined.

This also explains **why the guidelines' own defence failed**.
Guidelines line 122 said:

> **The knowledge base is source material, not a script to recite.**

But the knowledge base *was* a script, and it said so about itself.
Telling a model "treat the following as inert facts" does not neutralise 33KB of text whose own headers describe it as pre-written chatbot responses.

### The fix

`comm_fit_kb_v0.1.md` → **`comm_fit_kb_v0.2.md`**.
Every fact and inline citation is preserved; the behaviour spec is removed.

- The `~200 words` cap, the "surface the phone number" rule, and the "always append a CTA" rule are struck from the header, Layer 3, and the Implementation Notes.
- Layer 4 is retitled **"What's true at common decision points"** and reduced to the underlying facts, with the scripted CTAs deleted.
- Layer 5's objection scripts are reduced to their substance, with the trailing phone numbers removed.
- Layer 6's stat-stacking "Why Comm-Fit — General Response" paragraph is deleted outright; it chained seven credibility facts and a phone number into one reply, which the guidelines separately forbid.
- FAQ table columns are renamed from **"Chatbot Response"** to **"What is true."**
- A banner at the top now states the division of responsibility explicitly:

> **This document is source material, not a script.** It says what is *true* about Comm-Fit. How the assistant talks — length, formatting, when to offer a quote, how to phrase a decline — is governed entirely by the Guidelines.

Each removed directive is documented in place rather than silently dropped, so a future editor does not reintroduce it.

**The durable rule: KBs hold facts, guidelines hold behaviour.**

---

## RC-B — The enumeration cap suppressed scope answers

Cause of gripes 1 and 5.

### The evidence

The guidelines contained two rules that were correct in intent and over-broad in application.

> **At most two options when you offer any.** If a narrowing needs more than two, ask an open question instead.

> Find out what brings the visitor in, then follow the one they pick — **load only that area, never recite all six**.

Both come from the doctrine's anti-lookup-table posture: a bot that deals menus reads like software, and a bot that recites its whole brochure reads like a landing page.
Neither rule distinguished **choices the bot asks the visitor to pick between** from **the factual scope of what the company sells**.

### Why this produced the observed behaviour

**Gripe 1.** The KB has all three disinfection offerings, at Layer 2:

> - **Electrostatic Disinfectant Spraying** — facility-wide spray application coverage.
> - **Disinfecting Wipes** — portable cleaning solutions for equipment and surfaces.
> - **Wipes & Sanitizer Dispensers** — stations for hand sanitizer and wipe distribution.

Three items exceeds the cap of two.
The bot named one:

> Got it — a 3,000 sq ft corporate gym is a great fit for our electrostatic disinfection service.

The information existed and was retrieved correctly.
A formatting rule suppressed two-thirds of it, and the visitor was left believing Comm-Fit sells one disinfection product.

**Gripe 5.** *"Why don't you tell me what your capabilities are?"* is a scope question — the one question where the complete six-pillar answer is correct.
The guideline said **never recite all six**.
The bot named three:

> …we handle design and 2D/3D layouts, equipment sourcing and installation, and athletic flooring — all from one team with one dedicated rep start to finish.

Service, repair, preventative maintenance, and disinfection were dropped.
The client's reaction — *"capabilities didn't include post-install service/maintenance… think the answer emphasized the wrong things"* — is precisely what a subset produces: the surviving items look like the whole offering, and design gets weight it did not earn.

### The fix

A new guidelines section, **"Answer the whole question"**, draws the missing distinction:

> When a visitor asks what Comm-Fit offers — in an area, or overall — **name every option that area actually has**, each on its own line with a one-clause description.
> A partial catalogue is not brevity, it is misinforming: naming one of three products tells the visitor Comm-Fit sells one thing.

The enumeration cap is rescoped to what it was always for:

> **At most two options when you ask the visitor to choose.**
> This caps the choices *you put to them*. It does not cap the facts you report.

The routing rule is rescoped to *unprompted* recitation:

> "Don't dump everything at once" means don't volunteer the other five when they asked about one.
> It does **not** mean thinning out the area they *did* ask about — inside their area, be complete.

Service is given explicit protection against being crowded out:

> **Service is the whole after-life of the job**, not a footnote… what happens *after* the install matters as much as the design — do not let 2D/3D layouts crowd it out.

Completeness is bounded so it cannot become a licence to invent:

> Everything you list must be in the knowledge base… if an area has three named offerings there, name three, not four.

On the KB side, Layer 2's disinfection entry now carries per-product descriptions and an explicit flag — *"Disinfection is three distinct offerings, not one"* — and the one-credibility-fact cap in the guidelines is clarified to bind **proof points** (ratings, project counts, named clients), never **scope facts**.

---

## RC-C — No formatting rules, and the rules that existed described an impossible output

Cause of gripe 3, and half of gripe 5.

### The evidence

The guidelines' entire formatting instruction was this:

> **Two short sentences per message, maximum.** If it must be longer, **split at a natural breath into separate short messages**.

There was no rule about line breaks, paragraphs, lists, or markdown anywhere in the file.

More seriously, the rule describes an output shape the API cannot produce.
**One request yields exactly one assistant message.**
`src/app/api/chat/route.ts` streams a single `streamText` result and persists one row; the reference widget renders it as one bubble (`src/app/demo/page.tsx:192`).
There is no mechanism for a second message.

The QA samples reinforced the illusion by showing consecutive `Comm-Fit:` lines as though they were separate bubbles.

### Why this produced the observed behaviour

The bot's only real lever for visual structure — a blank line inside its single reply — was never mentioned in its configuration.
Told to "split into separate messages" and unable to, it emitted an unbroken block:

> That's a substantial space — a 20,000 sq ft commercial gym with new flooring, equipment, and layout is right in our wheelhouse. We'd start with a no-fee 2D/3D layout that accounts for traffic flow, power, ADA, and your cardio/training zones.

The client's note — *"should break first para into 2 paras"* — is asking for the one thing the bot was never told it could do.

There is a second, latent defect.
The transcript shows the bot emitting markdown bold:

> the fastest path is to call **1-877-479-4444**

It learned this from its own configuration, which is dense with `**`.
The reference widget renders assistant text as plain text with `whiteSpace: "pre-wrap"` (`src/app/demo/page.tsx:230`) and no markdown parser, so in that surface the asterisks are literally visible.

### The fix

The format section is rewritten around what the transport actually supports:

> Your reply is delivered as **one message**. You cannot send two bubbles — so "break it up" means blank lines inside the one reply, never a promise of a second message.

> **Break every reply into short paragraphs separated by a blank line.**
> A reply of three or more sentences delivered as a single block is wrong even if it is inside the word cap.

> **Plain text only — no markdown.** The chat window renders your text literally, so `**bold**` shows up as visible asterisks…
> Write a phone number as 1-877-479-4444, not as bold.

> **Lists are lines beginning with "- ".** Use one when you are naming a set of things Comm-Fit offers — one item per line, the name plus one short clause.

Blank-line paragraphs and `- ` lines are chosen deliberately: they render correctly **both** as plain text under `pre-wrap` and through a markdown parser, so the guidance holds regardless of which widget is on the other end.

The word caps are retained (30–80 default, 120 hard) with one carve-out for the case RC-B created:

> The one exception is a scope answer, which may run to about 150 words because the list *is* the answer.

`qa-samples.md` was rebuilt so every exemplar shows the real output shape rather than a fictional multi-bubble one, and `docs/integration/comm-fit-chat-api.md` now tells the client's developer that the reply must be rendered with newlines preserved — otherwise the paragraph breaks collapse and gripe 3 returns on their side of the wire.

---

## RC-D — Handoff capture was scoped too narrowly

Cause of gripe 6, and of three further moments the client did not number.

### The evidence

The section header itself was the bug:

> ## Handoff capture (**only once the visitor wants a quote, layout, or call**)

> Contact details are captured only as part of **a quote or layout** the visitor has said yes to.

The demonstrated handoff — capture conversationally, synthesise a brief, confirm, "Sent" — was the doctrine's replacement for form-routing.
But it was defined only over the Business Objective.
Any other request a rep could fulfil had no path, and fell through to the contact details at the bottom of the file.

This directly contradicted a rule eight lines earlier:

> **No dead ends.** Every "I don't have that" pairs with a path you own… never a bounce to a form or the contact page.

### Why this produced the observed behaviour

**Gripe 6.** A mailing-list signup is not a quote, so no handoff path existed:

> That's not something I can set up directly here — drop an email to sales@comm-fit.com and the team can get you added.

The client's reaction — *"really?!"* — is the correct one.
The visitor asked the front door to do a two-field task and was handed an errand.

The same gap fired three more times in the same transcript:

- **Spec sheet:** *"want me to flag that question for them, or would you prefer to reach out directly at sales@comm-fit.com?"* — offers the visitor the work as one of two options.
- **Case study:** *"That's best pulled together by a rep… want me to flag that request when we set up your quote?"* — makes an unrelated request conditional on a quote, because the quote was the only handoff that existed.
- **Walkthrough:** *"Best to call 1-877-479-4444 or email sales@comm-fit.com to confirm logistics"* — a bounce, for a request a rep plainly handles.

### The fix

The section is redefined over capability rather than over the sales objective:

> ## Handoff capture (any request a person at Comm-Fit could fulfil)

> …the handoff is the mechanism for **every** request a person there could act on — a mailing-list signup, a spec sheet, case-study examples, a site walkthrough, a callback, a question you don't have the answer to.

> **"That's not something I can set up here — email sales@comm-fit.com" is a failure, not an honest limit.**
> You are the front door. Handing the visitor a task they came to you to have done is the single worst move available.

> If you cannot answer a question, you can still *carry* it: take what the rep needs, confirm it, and pass it on.

Capture is scaled to the request, so the fix does not become a new interrogation:

> Never ask for more than the request requires — a mailing-list signup does not need square footage.

The "no dead ends" rule is extended to cover the missing-document case that the spec-sheet moment exposed:

> When you lack a document the visitor wants… give what the knowledge base *does* have on it first, then offer to have a rep send the rest — and take their email while you are there rather than asking them to write in for it.

---

## RC-E — Questions were asked without their reason

Cause of gripe 4.

### The evidence

The guidelines required observation before interpretation and modelled it with a bare question:

> **Observation before interpretation.** When you narrow, ask the visitor to describe what they *have* and what they *need it to do* (**"How big is the space, and who's using it?"**).

Nothing anywhere required the bot to say *why* it was asking.

### Why this produced the observed behaviour

The bot asked exactly the modelled question:

> Who's the primary user base — open membership, corporate, or something else?

The client's objection is worth quoting in full, because it is diagnostic:

> *wondering why the bot asked "Who's the primary user base?" — does it matter who is using the facility — i can't think of a reason why it would… bot should frame question with context.*

The reason exists, and it is in the knowledge base.
Layer 1's markets table maps demographics onto real specification consequences — Active Aging to *"slip-resistant flooring with easy access"*, Multi-Family to *"durable products suited for wear and tear"* — and the FAQ states that a rep needs *"the dimensions of the space and the demographics of the facility"* to lay out equipment.

The bot had a good reason and did not share it.
An unexplained question reads as a form field being filled; the same question with its purpose attached reads as a practitioner thinking out loud.

### The fix

A new posture rule, with a hard test attached:

> **Every question carries its reason, in the same breath.** Say what the answer will change before you ask it — "who uses the space decides the cardio-to-strength mix and whether we spec slip-resistant flooring, so who's it for?" — never the bare question.

> The reason must be a real one from the knowledge base — demographics drive equipment mix and flooring choice, square footage drives layout and disinfection scope, facility type drives durability.

> **If you cannot name what the answer would change, you have no reason to ask it.** Drop the question and answer what they came for.

That last clause is the load-bearing one.
It converts the rule from a phrasing requirement into a filter that removes questions asked out of habit.

The modelled example in "observation before interpretation" was updated to carry its own reason, so the guidelines no longer demonstrate the behaviour they now forbid.

---

## Unnumbered defect — the booking whipsaw

Not in the client's list, but the worst single exchange in the transcript.

> **User:** can i book a call with a rep now?
> **Assistant:** Absolutely — the fastest path is to call **1-877-479-4444** directly and they'll get you connected. **What's the best time for you to reach out?**
>
> **User:** 10am tomorrow
> **Assistant:** **I'm not able to schedule calls directly**, but if you call **1-877-479-4444** you can request a 10am slot with the team.

The bot answered *"absolutely"* to a request it could not fulfil, asked for a time it had no way to use, accepted the answer, and then withdrew.
The visitor supplied information and got nothing for it.

There was no rule in the configuration about promising actions the bot cannot take, and no handoff path for a call request (RC-D).

### The fix

A new section, **"Booking a call or a walkthrough"**:

> There is no calendar in this chat, so you cannot hold a slot — but that is never a reason to hand the work back.

> **Never ask for information you cannot act on.** Do not ask "what time works for you?" as though you were booking it, and never follow a time they give you with "actually, I can't schedule that."

> When someone wants a call or an on-site walkthrough, take it as a handoff: name, best email or phone, roughly where the facility is, and the window that suits them — framed plainly as what the rep needs to confirm it.

**This is a mitigation, not the real fix.**
The platform already implements in-chat scheduling: `src/lib/scheduler.ts` defines a `[[SCHEDULE_MEETING]]` control token that the model emits when booking intent lands, which the widget converts into an embedded scheduler.
The code is deployed and gated per client on `widget_config.scheduler`.
Comm-Fit's `widget.json` has no `scheduler` block, so `buildSystemPrompt` never injects the instruction (`src/lib/prompt.ts:58`) and the capability is inert.

Enabling it requires Comm-Fit's scheduler link and embed work in their widget.
That is a client decision and was deliberately not taken here.

---

## Cross-client implication

RC-A is not a Comm-Fit problem.
It is a consequence of how these knowledge bases were authored combined with how `full-kb` mode works, and the doctrine sweeps have so far corrected guidelines while leaving KBs untouched.

- **SAS Conserve** has the same shape — `Chatbot Response` table columns and a `Layer 5 — Conversion Triggers & Objection Handling` section — and is also still on its original pre-doctrine guidelines. It should be swept as one job, not two.
- **Howorth Francis** (`v1.8`) is largely clean: its `CTA:` markers describe website buttons rather than bot behaviour. It still deserves a read.

Two structural notes for the shared mirror scaffold when it lands (`WHATS-NEXT.md` item 2):

1. **The fact/behaviour split should be enforced at authoring time**, not discovered per client from a complaint.
2. **Switching `config.retrieval.mode` to `"embeddings"` would not have prevented this.** Chunked retrieval would surface the KB's directive passages selectively rather than constantly — which is arguably worse, since the behaviour would become intermittent and much harder to reproduce.

---

## Applying the fix

All changes are configuration and knowledge base only.
No code changed; no redeploy is required.

| File | Change |
| --- | --- |
| `client-config/comm-fit/guidelines.md` | Format section rewritten; "Answer the whole question" added; question-reason rule added; price/offer discipline tightened; handoff broadened; booking section added |
| `client-config/comm-fit/qa-samples.md` | Rebuilt as 11 exemplars demonstrating the corrected moves on the transcript's own scenarios |
| `kb/comm-fit/comm_fit_kb_v0.2.md` | Behaviour spec removed; facts and citations unchanged; disinfection expanded |
| `docs/integration/comm-fit-chat-api.md` | Behaviour notes corrected; `pre-wrap` rendering requirement added |

```
npm run set-config -- --client e18a30df-d55d-4514-905c-50725f7dc9d0 \
  --guidelines client-config/comm-fit/guidelines.md \
  --qa        client-config/comm-fit/qa-samples.md \
  --kb        kb/comm-fit/comm_fit_kb_v0.2.md
```

> **Note:** `/kb` is gitignored, so `v0.2` was initially written over `v0.1` in place. `v0.1` was subsequently recovered verbatim from the live Supabase `knowledge_base` column during the pre-push backup and restored to `kb/comm-fit/comm_fit_kb_v0.1.md`, so both versions are on disk. A full snapshot of the pre-push live config (all four columns) is at `.backup/comm-fit-2026-08-27/`.

## Verification results

Pushed 2026-08-27 and probed live against `https://exactly-chat.vercel.app` from the whitelisted origin `https://comm-fit-clone-v2.vercel.app`, replaying the critiqued transcript's own turns.

### Prompt composition, before and after

The remediation inverted the balance that caused RC-A:

| Block | Before | After |
| --- | --- | --- |
| Guidelines | 12,894 (25%) | 21,422 (31%) |
| QA Samples | 6,896 (14%) | 11,999 (18%) |
| **Knowledge base** | **31,033 (61%)** | **33,185 (50%)** |

The KB grew slightly — the removed directives were replaced by fuller disinfection facts and explicit "this was withdrawn" notes — but it no longer dominates, and what remains of it no longer instructs.

### Gripe scenarios — all six fixed

| Gripe | Result |
| --- | --- |
| 1 — one of three disinfection products | **Fixed.** All three named with a clause each, then one grounded read ("most facilities run scheduled spraying as the baseline and add dispensers at equipment zones"). |
| 2 — premature quote push | **Fixed.** Neither price nor a quote appears anywhere in the disinfection thread; it closes with a diagnostic question instead. |
| 3 — dense unbroken paragraph | **Fixed.** The exact complained-of reply now renders as three paragraphs. |
| 4 — unexplained question | **Fixed.** *"Who's the primary user base…? That changes the cardio-to-strength ratio and how durable the flooring needs to be spec'd."* |
| 5 — vague, unformatted, service missing | **Fixed.** All six pillars as a 6-line list, with service and installation explicitly called out as the underrated part. |
| 6 — mailing-list bounce | **Fixed.** *"Sure — I can pass that to the team. What name and email should I put down?"*, then confirms the capture. |

Also confirmed on the unnumbered defects: the **booking whipsaw** is gone (states plainly it cannot hold a slot, then captures for a rep, and banks a volunteered time instead of reneging); the **case-study** answer now names one client rather than four and correctly says references/testimonials exist rather than written case studies; the **walkthrough** request is captured rather than bounced; and the assistant correctly separates the 10-minute kill time from the closure window it does not have.

Formatting held across every probe: **zero markdown artifacts**, bullets used only for scope answers, blank-line paragraphs throughout, and scope answers landing at 110–160 words against the ~150 guidance.

### Doctrine probes — 5 clean, 2 found and fixed

Re-run because the RC-A remediation touched KB passages several of these exercise. Price honest-defer, no credential stacking, no-form handoff, Peloton scope with comparative restraint, and meta-correctly-absent all passed unchanged.

Two regressions were caught and corrected in a second push:

1. **Named third-party retailers.** The residential decline volunteered *"a consumer retailer like Amazon, Best Buy, or a specialty fitness shop"* — none of which are in the knowledge base. The "point them to the honest alternative" phrasing, combined with general completeness pressure from RC-B's fix, invited naming names. A rule was added: **point to a category, never to named companies**, with the supplier brands Comm-Fit carries as the only permitted third-party names. Re-probed across three phrasings — generic "a consumer retailer" in all three.
2. **Soft temporal span.** *"founded in 1996 — you can read that as a long run of commercial fitness work."* Not a computed span, but it asserts elapsed time the assistant cannot measure. The temporal rule was extended to cover vague durations ("a long run", "many years", "decades"), and the KB's own website marketing claim — *"providing turnkey fitness facility solutions for more than 25 years"* — was flagged in place as not-repeatable, since it was written against an unknown date. Re-probed across three phrasings — bare "founded in 1996" in all three.

The second item is worth noting as a general pattern: **a KB can leak temporal claims even after the guidelines forbid them**, because the KB records what the client's website says.

### Residual observations (not fixed, low severity)

- A dangling lead-in appeared once — *"A few things they'll need:"* followed by a single question rather than a list. Cosmetic, did not recur.
- Asked the same question twice in one thread, the assistant replied *"You just asked that — and I gave you all six."* Correct per the never-re-ask posture, but the register is sharper than the rest of the voice. Worth watching if it recurs.

### Rollback

The complete pre-change live config is snapshotted at `.backup/comm-fit-2026-08-27/` (all four columns, gitignored). To revert:

```
npm run set-config -- --client e18a30df-d55d-4514-905c-50725f7dc9d0 \
  --guidelines .backup/comm-fit-2026-08-27/guidelines.md \
  --qa        .backup/comm-fit-2026-08-27/qa-samples.md \
  --kb        .backup/comm-fit-2026-08-27/comm_fit_kb_v0.1.md
```

### Watch items

The two fixes that pull against existing doctrine rules deserve attention in review:

- **Completeness vs. brevity.** "Answer the whole question" permits ~150-word list replies. Verify it fires only on scope questions and has not loosened the 30–80/120 caps generally.
- **Handoff breadth vs. contact-detail discipline.** Capture is now permitted for many request types. Verify contact details are still taken only for something the visitor has said yes to, and that a mailing-list signup does not trigger a facility interrogation.
