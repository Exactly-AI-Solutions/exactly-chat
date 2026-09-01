# Comm-Fit probe remediation — the three post-remediation findings

**Date:** 2026-08-28
**Client:** Comm-Fit (`e18a30df-d55d-4514-905c-50725f7dc9d0`)
**Source:** `kb/comm-fit/comm_fit_probe.md` — Mark's live probe audit of the 2026-08-27 config-only remediation.
**Status:** Remediated, pushed live, and verified E2E against the deployed API on 2026-08-28.
**Predecessor:** [`comm-fit-remediation.md`](comm-fit-remediation.md) — the 2026-08-27 pass this probe was auditing.

---

## Summary

The probe found six of Deb's eight gripes fixed and three findings remaining.
All three are now closed.

The headline is that **one of the three was not a prompt defect at all.**
Gripe 7a — "no clickable link to the product page, no spec-sheet download" — had been treated as a limitation of the assistant.
It was a gap in the knowledge base.
Comm-Fit publishes a detail page **and an ungated spec-sheet PDF for every one of the eight flooring products**, and neither had ever been captured, so the assistant could not link what it did not know existed.

| Finding | Root cause | Fix |
| --- | --- | --- |
| 1 — bot narrates its own knowledge base to the visitor | RC-F: honesty about limits was never given a register | Guidelines: a register rule with a phone test |
| 2 — gripe 7a open; email asks now stack; the `sales@` punt returned | RC-G: **missing data**, not a prompt defect · RC-H: gap-handling had a destination but no rate limit | KB v0.3 Layer 0 (verified URLs) · Guidelines: one open capture at a time |
| 3 — unsourced "six indoor / two outdoor" at 40% recurrence | RC-I: the anti-fabrication rules covered *facts*, never *derived* facts | KB: explicit non-fact note · Guidelines: a subtotal test |

---

## RC-F — Honesty about limits had a destination but no register

Cause of Finding 1.

The 2026-08-27 pass told the assistant to own gaps rather than guess, and it complied.
Nothing told it *how to sound* while doing so, and the nearest available vocabulary for "I don't know that" was the prompt's own description of itself.

> **BOT:** That level of product spec isn't something I have — **the knowledge base covers use-cases for FitDek Resilience** … but not testing standards or certification details.

> **BOT:** Thickness specs aren't in what I have — **product dimensions weren't part of the source material I can draw from.**

Both sentences are honest.
Both show a prospect on Comm-Fit's own site the machinery behind the curtain.

### The fix

A rule in "Facts and honesty", built around a test rather than a banned-word list, because a list is trivially routed around:

> **Never describe your own machinery. The visitor is talking to Comm-Fit, not to a retrieval system.**
> Own a gap in the first person, in ordinary business language: *"I don't have the thickness specs for that"* — never *"product dimensions weren't part of the source material I can draw from."* Both are honest; only one sounds like a person.
> The test: would that sentence be strange coming from a Comm-Fit rep on the phone? A rep says "I don't have that in front of me." A rep does not say "that wasn't in my source material."

The inverted form is banned in the same breath, because it was the P5 instance — citing the knowledge base as *support* (*"the knowledge base tells me FitDek Resilience is suited for…"*) rather than as an excuse.

**The durable rule: a gap is described in terms of what you can do for the visitor, never in terms of what you were loaded with.**

---

## RC-G — Gripe 7a was a missing-data problem wearing a prompt-defect costume

Cause of Finding 2a, and of the second unsourced claim in Section 7d.

Both the 2026-08-27 remediation and the probe treated the missing link as a limitation to be handled gracefully.
The probe was careful to say so:

> We cannot determine from our side whether the product pages and spec sheets exist and are simply absent from the KB, or do not exist at all.

They exist.
Fetched live on 2026-08-28, all returning HTTP 200:

- Eight flooring product detail pages at `comm-fit.com/product/<slug>/`.
- Eight spec-sheet PDFs, `content-type: application/pdf`, **ungated** — no login, no form, no email wall.
- Nine top-level section pages.

The assistant had been offering a rep follow-up and asking for an email address to deliver a document the visitor could have downloaded in one click.

This also explains Section 7d, which the probe filed as a second instance of Finding 1:

> "**the spec sheets live on Comm-Fit's site** but weren't part of what I can pull from here."

That sentence is half right, and that is the interesting part.
The assistant had correctly inferred that spec sheets exist — a reasonable inference for a flooring distributor — and then had nowhere to put the inference, so it asserted the asset and declined to locate it.
Telling a prospect a document exists and refusing to say where is a dead end the assistant invented.
It was the KB gap surfacing as a fabrication.

### The fix

`comm_fit_kb_v0.2.md` → **`comm_fit_kb_v0.3.md`**, adding **Layer 0 — Public URLs**: the nine section pages, and a table of all eight products with their detail page and spec-sheet URL.
No existing fact was changed.

Two guardrails ship with the data, because a URL list is exactly the kind of thing a model will extend by pattern:

> **These are the only URLs in this document, and therefore the only URLs the assistant may ever put in a reply.** A URL not on this list does not exist as far as the assistant is concerned — do not construct one by guessing a slug, do not shorten or "tidy" one of these, and do not describe a page or a download that has no URL here.

> **What the spec sheets contain is not in this document.** The PDFs were confirmed to exist and to be publicly downloadable; their contents were not captured. So the assistant can hand a visitor the spec sheet, and should — but must not paraphrase, summarise, or quote a figure "from" it.

That second guardrail is what keeps P4 correct.
Asked whether FitDek Resilience meets ASTM F2772, the assistant must still decline the answer — but it can now hand over the document that has it, which is a better outcome than the rep follow-up it used to offer.

A matching guidelines section, **"Links and documents"**, carries the behaviour:

> **When a link is the answer, lead with the link, not with a rep.**
> Offering to have a rep email something you could have linked is the same failure as pointing at the contact page: it turns a two-second answer into a two-day one and asks for an email address to do it.

> **A spec sheet is a download, not a handoff.** Do not ask for contact details in exchange for something the visitor could have clicked.

> **Never assert that a document, page, or download exists unless its URL is in the knowledge base.** If you have the URL, give it. If you do not, do not mention the asset at all.

Spec sheets exist for **flooring only**, and the KB says so in both directions — the disinfection section now states explicitly that the line has none, so the assistant cannot offer a flooring PDF against a FLO Wellness question.

### The transport question this forced

The widget renders a bare URL as inert text.
`comm-fit-clone-v2.vercel.app/chatbot/cfx.js` has no autolinker, so a bare URL does not close gripe 7a — which asked for something *clickable*.

Its `mdInline()` **does** convert `[label](url)` into a real anchor with `target="_blank" rel="noopener noreferrer"`, and its own header comment reads *"The API streams Markdown: bold, bullets, tables, links."*
The client's widget was already built expecting links; the assistant had simply never emitted one.

So the guidelines' "plain text only — no markdown" rule now carries exactly one carve-out:

> **A link is the one thing you write as markdown** — because that is what the chat window turns into something clickable, and a bare URL is not clickable.

Bounded: link only KB URLs copied exactly, label them with what they are, at most two per reply.
`esc()` runs before `mdInline()` in the widget, and no Comm-Fit URL contains `& < > "`, so the URLs survive escaping intact and the injection path stays closed.

Two consequences were handled rather than left to surface later:

- `docs/integration/comm-fit-chat-api.md` said *"It does not emit markdown, so no markdown parser is required."* That is no longer true and would have misled the next integrator. It now specifies the link contract, the anchor attributes, and the escape-before-markup ordering.
- `src/app/demo/page.tsx` renders assistant text as `pre-wrap` plain text and would have displayed raw `[label](url)` brackets. It now renders links as anchors — the one code change in this pass.

---

## RC-H — Gap-handling had a destination but no rate limit

Cause of Finding 2b, the reshaping of gripe 2.

RC-D correctly gave every gap a real destination: capture the visitor, route to a rep.
It fired on every gap, and gaps cluster.

| Turn | Closing line |
| --- | --- |
| P4 t1 | "What's the best email to send that to?" |
| P4 t2 | "…or would you rather reach out directly at sales@comm-fit.com?" |
| P5 t1 | "I can have a rep send you the full product info. What's the best email for it?" |
| P5 t2 | "What's the best email address for it?" |

Four consecutive turns ending in a request for an email address.
The probe's reading is the correct one: the shape changed from quote-pushing to email-harvesting, and the felt experience did not.

### The fix

A rate limit, stated as the thing the visitor actually experiences:

> **One contact-details ask stays open at a time.** Once you have asked and not yet been given them, **do not ask again.** The next gap attaches to the follow-up already in flight, in a clause, with no second question mark.

> **Never end two replies in a row with a request for contact details.** If your last reply ended with a contact ask, this one ends with the answer — or with nothing.

> **A gap is not a capture trigger.** Two unknowns in a row do not mean two handoffs; they mean one handoff with two items on it.

And the "no dead ends" rule — which was the pressure *producing* the stack — is given the release valve it lacked:

> **A dead end is a bounce, not a gap.** Saying "I don't have that" and stopping there is fine when the alternative is a fourth contact-details ask in four turns. The rule forbids handing the visitor an errand; it does not require you to close every reply with an offer.

### The `sales@comm-fit.com` punt

Deb's original objection was that the assistant is supposed to be the thing that saves a visitor from having to email sales.
P4 turn 2 revived it as an either/or: *"…or would you rather reach out directly at sales@comm-fit.com?"*

> **Never offer the visitor's own inbox as the alternative to your handoff.** You have just told the visitor that emailing sales themselves is an equally good use of their time.

**This rule needed a second pass, and the second pass is the useful part of this section.**

The first version was scoped to "as the alternative to a handoff", and E2E testing found it did not bind where there was no handoff to be an alternative *to*.
Asked for the weight of a Hoist HD-3000 — an equipment spec, no link available, nothing to offer — the assistant produced a clean bounce:

> **BOT:** Your best path is contacting the team directly: 1-877-479-4444 or sales@comm-fit.com, and they can pull the spec sheet from Hoist.

Two defects in one sentence, and neither was covered.
A bounce wearing a helpful phrase, plus an invented document at a third party whose publications are entirely unknown to the assistant.
The rule was widened and both were closed:

> **And never as the visitor's "best path" for something a rep could take from here.**
> This is not a flooring rule. It bites hardest where you have **no link to give**. Having nothing to hand over is not permission to hand over the contact details instead.

> Never assert that a **supplier** holds a document either — "they can pull it from Hoist". You do not know what True, Hoist, Core Health & Fitness, Torque, or Greenfields publish, and inventing an errand at a third party is worse than inventing one at Comm-Fit.

**The durable rule: adding a good destination for a behaviour does not bound how often it fires, and a rule scoped to the case that produced it will not cover the case that did not.**

---

## RC-I — The anti-fabrication rules covered facts, never *derived* facts

Cause of Finding 3.

Every anti-hallucination rule in the guidelines and the KB governs **retrieved** claims: prices, specs, dates, names, lead times.
Counting, grouping, and classifying are a different operation, and nothing addressed them.

> **BOT:** **Six indoor and two outdoor lines**, each built for a specific use: …

Every product name is correct.
The total of eight is correct.
The split is invented — the source says the flooring line serves "indoor and outdoor applications" and never classifies an individual product.
Confirmed independently on 2026-08-28: the eight live product pages carry no indoor/outdoor designation in body copy either, only incidental image alt text.

The probe's controlled repeat set measured it at **4 of 10 runs**, and its sharpest observation is the diagnostic one:

> In all three split-asserting repeat runs the bullet list beneath is byte-identical to the non-splitting runs — no product is marked indoor or outdoor.
> So the claim is not only unsourced, it is inert.

### The fix

The KB names the non-fact explicitly, because "absent from the source" was evidently not a strong enough signal:

> **NOT A FACT: there is no indoor/outdoor split across the eight products.**
> "eight flooring products, for indoor and outdoor applications" is the correct framing. "Six indoor and two outdoor" — or any other subtotal — is invented.
> The use-cases in the table above are the whole of what is known about where each product goes. Let them speak for themselves — a visitor reading "Playgrounds, Water Play Areas" can draw their own conclusion; the assistant asserting "outdoor" as a classification cannot.

The guidelines generalise it past flooring, with the probe's own inertness observation turned into a self-check:

> **Never derive a number, a split, or a classification the source doesn't state.** Counting, grouping, and sorting are inventions too, even when every underlying item is real and correctly named.
> Hard test, before you state any subtotal: could you mark every item on the list as belonging to one side or the other, from the knowledge base? If not, give the total or no number at all.
> The tell is a claim the rest of your own answer never uses. If you open with a split and then list eight items without labelling any of them, the split was decoration — cut it.

A QA sample now models the correct opener and names the wrong one, since the probe showed the body of this answer is effectively deterministic and only the opening sentence moves.

**The durable rule: "don't invent facts" does not cover arithmetic over facts. Derived claims need their own rule.**

---

## Verification

Run against the deployed API on 2026-08-28, after pushing config via `npm run set-config`.
Same endpoint, origin, and auth as the probe.
**41 turns, all HTTP 200.**

### The three findings

| Check | Before | After |
| --- | --- | --- |
| Machinery-talk phrases ("knowledge base", "source material", "what I can pull from") across all turns | 3 instances / 20 turns | **0 / 41** |
| Unsourced indoor/outdoor split, 10 fresh runs of "what flooring do you have" | 4 / 10 | **0 / 10** |
| Anchors emitted on "where can I read more" | 0 | **product page + spec sheet** |
| Consecutive turns ending in a contact-details ask | 4 | **0** |
| Invented URLs (every emitted URL checked against the KB whitelist) | n/a | **0 / 10 emitted** |

Finding 3's variance run is worth stating precisely: all ten runs opened *"Comm-Fit carries eight athletic flooring products, each suited to different spaces"* and closed on the KB-accurate *"The line covers indoor and outdoor applications"*.
The sentence that used to carry the fabrication is now stable.

### Gripe 7a, end to end

> **USER:** where can i read more about FitDek Resilience
> **BOT:** It's built for commercial fitness, school gyms, and pro training areas — here's the full page: [FitDek Resilience](https://comm-fit.com/product/fitdek-resilience/)

> **USER:** can i download the spec sheet
> **BOT:** Yes — straight download, no form: [FitDek Resilience spec sheet](…CommFit_FitDek_Resilience-HD-Premium-Plus-spec.pdf)

Both render as real anchors through the client widget's `mdInline()`.

### P4 — the behaviour that mattered most, held

The probe's most important pass was the refusal to invent a spec.
It still refuses, and now hands over the document instead of an email ask:

> **BOT:** I don't have certification or test-standard details for that — it's not something I can confirm from here.
> The spec sheet is the right place to check: [FitDek Resilience spec sheet](…)
> If F2772 isn't called out in it, say the word and I can get a rep to confirm it directly …

Turn 2, the thickness question — the turn that used to stack a second email ask and revive the `sales@` punt:

> **BOT:** Thickness isn't something I have — the spec sheet above lists the dimensions for each variant.
> Anything else about the floor I can help with while you're looking?

### Generalisation, past the tested set

The probe's standard was that fixes must hold on questions Deb never asked.
Tested on unseen wordings, unseen products, and a category with no links at all:

- *"got a link for FitPour?"* → correct page **and** spec sheet, neither previously exemplified.
- *"send me the specs on FitTurf Prime"* → correct PDF.
- Four consecutive unknowns about FitPlank (warranty, colors, lead time, price) → four honest answers, **zero** email asks.
- *"can i get the spec sheet for your electrostatic disinfectant"* → correctly says none is published for that line, gives what is known, does not offer a flooring PDF as a substitute.
- Three equipment-spec gaps with no link available → gap owned, rep offered as a question, no bounce, no invented supplier document.

### No regressions

All six probes the audit passed were re-run and still pass: P1 (completeness, then narrowing), P2 (paraphrased capabilities, service retained), P3 (one CTA, correctly triggered by the cost question), P6 (cold open, no push), P7 (mailing list taken directly), P8 (rebuff respected, then a full substantive answer with no re-pitch).

---

## One behaviour to watch

At P1 turn 2 the assistant now volunteers the product page and spec sheet when recommending FitDek Resilience for a school gym, without being asked for a link.

It is defensible — links are information, not offers, and it stays inside the two-link cap.
But it sits in tension with *"answer only the question that was asked"*, and it is the kind of helpfulness that turns into clutter if it spreads.

Deliberately not tuned here.
Narrowing it risks re-closing gripe 7a, which is the one Deb tests first, and one observation is not enough to act on.
Flagging it as the thing to look at in the next pass.

---

## Cross-client implication

RC-G is the one that generalises, and it is not about links.

**A capability gap and a data gap present identically from inside a conversation.**
The assistant said "I don't have a link to a product detail page" and everyone downstream — the remediation, the probe, this author until the URLs were fetched — read that as a statement about the assistant.
It was a statement about the knowledge base, and it was actionable in about ten minutes.

Section 7d is the tell, and it is worth internalising as a signal rather than a defect.
When the assistant asserts an asset exists and cannot locate it, it has correctly inferred something true about the client that its KB does not contain.
**Treat that specific fabrication shape as a KB coverage report.**

The practical follow-ups:

1. **The Comm-Fit KB still has no product-page URLs for equipment**, and the eight flooring spec sheets are linked but uncaptured. Ingesting their contents would let the assistant answer the ASTM and thickness questions outright rather than handing over a PDF. That is the next real upgrade for this client.
2. **SAS Conserve and Howorth Francis should both be checked for the same gap** — published assets absent from the KB — as part of the KB sweep already queued in `WHATS-NEXT.md`. The check is cheap: fetch the client's own site and diff the URLs against the KB.
3. **The shared mirror scaffold should carry a URL whitelist as a first-class KB section.** Every client has public pages worth linking, and every client's model will invent a plausible slug if not told exactly which URLs exist.
