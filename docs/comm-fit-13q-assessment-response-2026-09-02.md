# Comm-Fit 13-question assessment — response and changes

**Date:** 2026-09-02
**From:** Matt (API / retrieval side)
**Re:** `Updated Assessment Of KB 13 Questions Test.md` (Mitch) and `comm_fit_kb_v3_test_context_for_Matthew_2026-09-02.md` (Mark)

This covers what I changed on our side, what I deliberately did **not** touch and why, the two architecture questions asked of me, the one decision that blocks the authority rerun, and the canonical measuring stick for scoring.
It reflects three rounds of feedback whose consistent through-line is: *the remaining gap is retrieval, not prompting.*

---

## 1. What I changed (code, this branch)

**One** change survives, and it is not a fix for the retrieval/specificity gap — it is the evidence-state architecture Mark asked us to build.
It is cross-client doctrine, so it lives in the **global prompt scaffold** (`src/lib/prompt.ts`), not in a client's Guidelines — and the KB itself says so: *"The KB carries evidence state; doctrine carries how a bot acts on it."*

**Conflict + external-authority handling (Mitch's §5, and Mark's open question #2).**
The scaffold now makes the per-claim status markers actually do work at generation time:

- Conflicting values for the same fact → do not silently pick one; surface the disagreement or defer, never present a contested value as settled.
- A claim confirmed against an external governing authority as of a check date → treat as current and prefer it over the client's own material where they disagree.
- Internal status/evidence markers and provenance are act-on-but-never-narrate (kept consistent with Comm-Fit Guidelines §213).

The build is green. Nothing is deployed — it sits on `comm-fit-rag-migration`.

Two other prompt rules I drafted have been **pulled back out** — see §2. The through-line of all three feedback rounds is the same: *the remaining gap is retrieval, not prompting; don't paper over the diagnostic signal.*

## 2. What I deliberately did NOT change

**First-person voice — NOT a prompt fix (revised after the follow-up assessment).**
An earlier draft added a `## Voice` rule forcing "we/our"; I have removed it.
The follow-up read is right: the third-person drift is a *symptom* of retrieval displacement, not an independent regression.
"Their techs" and "what Comm-Fit does" show up in exactly the answers that lost the specific fact (Q9, Q10, Q5, Q7); Q5 is the control — it kept the brand names and is the most first-person answer in V.3.
A prompt rule would paper over the retrieval signal rather than fix the cause, and would make an empty answer *sound* like the company while still saying nothing.
Fix Q3/Q9/Q10 retrieval and most of the voice returns on its own.

**Subject attribution (Q11) — NOT a prompt fix either (revised after the third round).**
An earlier draft added a "keep every fact attached to its subject" rule; I have removed it.
The latest read classes the Q11 `$125` bleed as **retrieval/context integrity, not a canonical-writing problem** — so a generation-layer rule is the wrong layer, and it would suppress the very output that tells us context integrity is broken.
The right move is the diagnostic Mitch's Fourth asked for: inspect what actually gets retrieved for a project-cost query (see §4).
A generation-layer rule is justified *only if* that diagnostic shows the `$125` fact legitimately co-occurs in context and generation is the culprit — decide the layer from evidence, not up front.

**Retrieval params (`topK`, `similarityThreshold`, reranker).**
Untouched, on purpose.
Mitch's C9 and authority tests are single-variable by design; changing retrieval now would contaminate both.
"Before Matt changes retrieval logic" is his explicit gate, and I'm honouring it.

**The corpus.**
Mark's items (remove the unsourced positive BuyBoard assertion from the `NOT_FOUND_IN_CAPTURE` block, keep 48/72 as `CONFLICTED`, scan Axiell/Niagara/SAS, ingest the finalized authority claims) stay Mark's.

**Canonicals / Comm-Fit Guidelines §266.**
Untouched — that's Mitch's Sixth step (joint review after retrieval settles), and touching it now would both jump the sequence and muddy the authority test. But it needs a decision first — see §5.

## 3. The two architecture questions (Mark's §6)

**#1 — What does the embedding layer ingest: the distilled fact blocks, or a cleaned page corpus?**
The distilled fact blocks.
`scripts/ingest.ts` picks a chunker by document shape, not by client.
A claim-block doc (3+ lines matching `**[ID]…` at line start) — which V.3 is, 275 blocks — is split **one block per chunk**, no overlap, because each block already carries its own claim/evidence/source/date.
There is no separate page corpus in the loop; we embed exactly the file(s) passed to `npm run ingest`.
So extraction quality per client is, literally, block quality.

**#2 — How do per-claim `status`, `source`, and `as-of` reach the model at generation?**
Today, unevenly:

- `source_filename` / `source_page` are structured columns and reach the model as a `[source: …]` tag on each chunk (`formatChunks`).
- `status` and `as-of` are **not** structured — they reach the model only as literal prose inside the chunk body, with (until this change) **no instruction on how to act on them**. They were effectively documentation-only.

My §1 conflict/authority rules are the missing half: they tell the model what `CONFLICTED` and an authority-confirmed-current claim should *do*.
If we want these to be robust rather than prose-dependent, the durable version is to promote `status`/`as-of` to real chunk columns (like `source_*`) and render them into the context block deterministically — a small, clean follow-up, not needed for the next tests.

## 4. Q11 — diagnose the layer before fixing it

The latest feedback is explicit that the `$125` bleed is retrieval/context integrity, not writing — so the first step is the diagnostic Mitch's Fourth assigned to me, not a patch:

1. Embed the exact frozen Q11 query and run `match_kb_chunks` against Comm-Fit's live chunks; read the top-8 that actually land in context.
2. If the `$125` service-call block is retrieved for a project-cost query, the fix is retrieval — its block text must make its subject scope unambiguous (service call → diagnosis → travel + 30 min labor) so it stops being a near-neighbour of cost queries; and/or a reranker that favours subject/entity match. Block-authoring is Mark's; reranking is retrieval logic, gated behind Mitch's sequence.
3. Only if `$125` legitimately co-occurs in context (e.g. retrieved alongside "no project price ranges") and the model still misapplies it is this a generation problem — at which point the subject-attribution rule I drafted goes back in, justified by evidence.

To run step 1 I need the frozen Q11 wording (from `commfit_frozen_question_set_v1.1_20260901.md`, "available on request") and confirmation the embeddings path + OpenAI credits are live. Say the word and I'll run it and report the retrieved set.

## 5. Decision needed before the authority rerun (Mitch's Second)

There is a direct conflict between the new authority-precedence doctrine and Comm-Fit Guidelines **§266**, which currently tells the bot to **always defer** on contract/cooperative numbers ("those age out… a rep confirms whichever vehicle is currently active").

Mitch's target Q13 behaviour after the authority ingest is the opposite: correct #665-22, state Comm-Fit is still a current BuyBoard vendor, distinguish the two current contracts.
With §266 as written, the bot will keep deferring even once the authority-verified claim is present — and the authority test will look like a failure that is actually a canonical rule, not a retrieval or architecture problem.

**Options:**
1. Give §266 a carve-out: defer on stale/unsourced vehicles, but state a contract number when the context carries an authority-verified, current-as-of claim for it. (My recommendation — it's the minimal edit that lets the Second test measure what it intends.)
2. Leave §266 as-is and accept that Q13 will defer; treat "did it stop repeating the stale number and stop asserting an unsourced one" as the pass bar, not "did it state the new number."

This is a canonical call (yours + Mitch's), so I've left §266 untouched pending that.

## 6. The C9 experiment — ready to run when you are

Feasible and cheap.
V.3 has ~47 C9 blocks out of 275; C9 blocks are individually tagged, so a no-C9 variant is a mechanical filter, re-ingested to a **throwaway test client** (never Comm-Fit's live row), then rerun Q3/Q9/Q10 only.
Two sequencing notes from Mark's context doc that I'd honour:

- Run it against the **cleaned** corpus (after Mark's §First edits), not the current file, so the baseline is stable.
- Keep v0.4 (+~79 product pages) out of the tested index until the authority and C9 single-variable tests are done, or their results can't be attributed.

I can wire and run this experiment on your go-ahead — say the word and I'll produce the no-C9 variant and the side-by-side.

## 7. The measuring stick — score against the canonicals, don't rewrite them

The third round is clear that the canonicals are the quality standard and stay fixed: *"I would not rewrite the canonicals to meet the bot. I would do the opposite."*
The current read is that the bones are already canonical (direct to the real problem, one useful question, willing to challenge the visitor — e.g. Q12), and the gap is the **second move**: *"You told me X. Because I know this business, that means Y matters more than you thought. So here's what I'd do next."*
That second move depends on the specific fact being retrieved — which is why this is a retrieval problem, not a prompting one.

Score every answer, canonical by canonical, on five checks (superset of the earlier §7 "measure Exactlyness diagnostically"):

1. **Retrieved the specific thing** a canonical-quality employee would know (named product, real territory, Lincoln Property, a real constraint)?
2. **Used it** to make a judgment, correction, or narrowing move — not just listed considerations?
3. **Asked the next question because the answer genuinely depends on it**, not because chatbots ask questions?
4. **Kept work away from the visitor** (didn't hand back "a rep can pull examples" when the corpus already has the example)?
5. **Landed naturally**, without an unnecessary handoff?

Per-question standard from the round, to calibrate scoring:

- **Q3** — has FitDek/FitTurf; canonical answer narrows toward the actual surface decision with Comm-Fit product knowledge, not generic rubber-thickness advice.
- **Q9** — canonical never accepts "a rep can pull examples" when Lincoln Property is in the corpus (fails check 4).
- **Q10** — structurally close (service landing: what equipment / what's wrong / where); gap is the lost territory distinction + third-person slip — both downstream of retrieval.
- **Q11** — conversational form is canonical (no fabricated range, explain why, get what's needed); the `$125` bleed is the only thing wrecking it → context integrity (§4).
- **Q13** — once the authority claims are present, a near-perfect "did something the static site couldn't": correct the wrong premise, explain the consequence, distinguish equipment vs flooring, keep the purchase moving (needs the §5 §266 decision).
