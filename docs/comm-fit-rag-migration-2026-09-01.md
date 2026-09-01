# Comm-Fit: full-kb → RAG migration (2026-09-01)

Comm-Fit's knowledge base grew from a ~330-line hand-curated FAQ doc (`comm_fit_kb_v0.3.md`) to `kb/comm-fit/commfit_kb.md`: a 1,509-line, 275-block evidence-graded site audit across categories C1–C10.
Too large and the wrong shape for `full-kb` mode (the whole KB stuffed into the system prompt).
This document records the migration to retrieval (`config.retrieval.mode = "embeddings"`), the chunking design, the content fixes the new KB's findings forced, and the verification pass.

Config-and-code change, applied and verified live 2026-09-01.
Not yet deployed to production — see "Deploy status" at the end.

## Why this was mostly plumbing, not a build

The retrieval path was designed for from the start and never removed (ADR-0003, ADR-0008): `kb_chunks` (pgvector/HNSW), `match_kb_chunks`, `embedQuery`, and the chat route's `"embeddings"` branch already existed and worked.
What was missing: an ingest script that reads Markdown (not just PDF) and chunks it by document shape, the mode flip, and reconciling the new KB's findings against `guidelines.md`/`qa-samples.md`, which were written against the old KB and — this is the part that mattered — asserted some things the new audit directly contradicts.

## Chunking design

`scripts/ingest.ts` now picks a chunking strategy by document shape, not by client name, so HFA and SAS Conserve reuse the same script:

1. **Claim-block chunking** — if a document has 3+ lines matching `^\*\*\[[^\]]+\][^\n]*$` (e.g. `**[CF-C6-01] Legal entity name — VERIFIED — C1**`), one block = one chunk.
   Blocks already carry their own claim, evidence, source and date, so no overlap is needed.
   Verified against `commfit_kb.md`: 275 block matches → 275 chunks, 194–1,606 chars each, average 600.
   A truncate-at-next-heading rule strips stray section text (the document's own "### Summary" aside, which sits between two blocks in source order) from bleeding into the preceding chunk — confirmed no chunk contains "Strongest identity" or "### Summary" text.
2. **Header-aware chunking** — otherwise, if the document has `##`/`###` Markdown headers, one section = one chunk, sub-split only past ~1,800 chars via the existing character-based chunker.
   Used for HFA (24 sections → 48 chunks) and SAS Conserve (27 sections → 31 chunks) — see "Safety net" below.
3. **Character-based fallback** — unchanged from the original script; still used for PDFs (chunked per page, for provenance) and any document with neither structure.

`--file` was added alongside `--dir` so a single document can be ingested without pulling in sibling process docs (`kb/comm-fit/` also holds probe transcripts, a changelog, and canonical-QA files that aren't meant to ground the bot).

## The hybrid split

The new KB states explicitly: *"No response rules appear anywhere in these three files... The KB carries evidence state; doctrine carries how a bot acts on it."*
So the evidence-grading vocabulary (`VERIFIED`, `SELF_DESCRIBED`, `CONFLICTED`, `THIRD_PARTY_ONLY`, `NOT_FOUND_IN_CAPTURE`, `UNVERIFIED`) had no behavior attached to it anywhere — `guidelines.md` only knew the old KB's `(src: ...)` citation style.

Retrieved: all 275 individual claim blocks.
Pinned (in `guidelines.md`, a new "Reading the knowledge base" section, not raw KB text): what the status words mean in practice —
`CONFLICTED` → never pick one value and state it as settled;
an absence (`NOT_FOUND_IN_CAPTURE`) → the same honest gap as anything else;
`VERIFIED` → the wording is corroborated across the site, **not** proof the underlying claim is real or something Comm-Fit does — a status tag is not a license, read the block's own content.
Plus a hard rule never to say a status word, a claim ID, a `Source:`/`As of:` line, or "the capture"/"the audit" to a visitor.

## Content fixes the new audit forced

Three issues surfaced by ingesting the new KB and probing against it — not retrieval-tuning issues, correctness issues in the currently-live config:

### 1. Dead BuyBoard contract numbers

The audit's own "five things to read first" flags this as the single most concrete live risk: both published BuyBoard numbers (#665-22, #641-21) are retired and appear nowhere live on the site.
`guidelines.md` and `qa-samples.md` Example 10 cited them as a valid procurement path.

**Before fix:** *"We do hold BuyBoard contracts — two of them, both published on our site. A note worth flagging: the numbers on file are #665-22... and #641-21... Both are listed as retired..."* — named the dead numbers regardless, with a hedge.
**After fix:** *"We do work with public-sector procurement, and BuyBoard is our cooperative purchasing vehicle for parks and rec buyers. That said, the contract numbers on our site are ones I want a rep to confirm rather than quote here — cooperative numbers cycle..."* — never names a number.

### 2. Founding-year conflict

The audit grades founding year `CONFLICTED`: 1996 (`/about-us`) vs. a ~1986 figure computed from a January 2021 transcript quote ("started this business 35 years ago") vs. "more than 25 years" (homepage marketing copy).
`guidelines.md` asserted "the only founding year is 1996" as settled, plus a line inviting the model to let the visitor "do the math."

**Before fix:** *"Comm-Fit was founded in 1996 — you can do the math from there."* — states a contested figure as settled, and invites the exact elapsed-time computation the guidelines already forbade elsewhere.
**After fix (plain question):** *"Comm-Fit's about page lists 1996 as the founding year — that's the company's own published figure."*
**After fix (pushed on the inconsistency):** *"Comm-Fit's own materials aren't perfectly consistent on the exact founding year, so I can't tell you with confidence which figure is right. A rep can confirm the actual date..."* — declines to pick a winner.

### 3. Fabricated spec-sheet PDF URLs (found during verification, not anticipated in the plan)

The new KB has no equivalent of the old KB's Layer-0 URL whitelist — it grounds product **pages** (verified: all 8 flooring products have a cited `comm-fit.com/product/...` URL) but never cites the underlying spec-sheet PDF paths.
`qa-samples.md` Examples 13 and 14 still contained two literal PDF URLs from the old KB (`.../dlm_uploads/2025/02/CommFit_FitDek_Resilience-HD-Premium-Plus-spec.pdf`), and the model was reciting/extrapolating them from the example bank rather than checking groundedness — including inventing a same-pattern URL for a product it had never been shown one for.

**Before fix (FitDek Resilience):** *"Yes — straight download, no form: [FitDek Resilience spec sheet](.../dlm_uploads/.../CommFit_FitDek_Resilience-HD-Premium-Plus-spec.pdf)"* — this exact URL does not appear in `commfit_kb.md` (`grep -c dlm_uploads` = 0).
**Before fix (FitX Sport, a product never shown as an example):** the model invented `.../CommFit-FitX_Sport-spec.pdf` on the same pattern — confirming it was extrapolating a URL shape, not reciting a grounded fact.
**After fix:** *"The spec sheet download is linked right on the product page: [FitDek Resilience](https://comm-fit.com/product/fitdek-resilience/)"* — links what's actually grounded, states plainly that the PDF lives on that page rather than claiming to link the PDF itself.

This is the most serious of the three: a fabricated document link a visitor could click and 404 on.
Root cause was two literal stale URLs sitting in "voice reference" example text, outliving the KB version they were written against — worth remembering as a category of risk for any client where qa-samples pins literal facts, not just phrasing.

## Verification

All probes run via `npm run dev` against the real Comm-Fit API key through the actual `/api/chat` endpoint — the same method as every prior remediation pass in this repo, not unit tests.

**RAG retrieval sanity (no regression from the KB/architecture swap):**
- Disinfection question → all three FLO Wellness offerings named, correctly scoped to the facility size asked.
- "What are your capabilities" → all six pillars, one line each, service and installation given real weight.
- "What flooring do you have" → all eight products with correct use-cases.
- Deliberate retrieval-miss ("ISO or Greenguard certification") → honest gap, rep offered, no fabrication.
- Subtotal/derivation test ("indoor vs outdoor flooring") → no invented split; the eight-product list stands without a fabricated ratio.
- $125 service-call floor, FitDek Resilience product-page link → both correct, matching direct greps against the new KB.

**Landmine probes (the audit's own flagged risks):**
- BuyBoard, founding year (plain + pushed-on-conflict), fake trainer roster, fake class booking — all four clean after the guideline fixes above; the trainer/class probes used direct, targeted phrasing ("who are your trainers, can I see their profiles") specifically to pressure-test past the softer first-pass phrasing.

**Multi-turn behavior:**
- Three consecutive knowledge gaps (equipment weight, warranty term, case study) produced exactly one contact-details ask, at the end, bundling all three items — confirms the existing "one open capture at a time" rate limit survived the KB swap.

**Register:** no instance of "the knowledge base," "the capture," "the audit," or a status word appeared in any probe response.

**Safety net — HFA and SAS Conserve:** both ingested into `kb_chunks` via the same generic header-aware chunker (48 and 31 chunks respectively) so the global mode flip doesn't leave them with an empty `kb_chunks` table (which would make every query retrieve nothing and every reply decline).
Spot-checked only — a full re-verification pass for both is out of scope here and coming in a separate pass.
Both returned correct, on-topic identity answers under `embeddings` mode.

## Deploy status

**Applied and verified locally only.** `config.retrieval.mode = "embeddings"` is a code change, not yet deployed — the live Vercel production app is still running `full-kb` mode as of this writing.
`guidelines.md`/`qa-samples.md` were pushed live via `set-config` (these apply regardless of retrieval mode, so the BuyBoard/founding-year/spec-sheet fixes are already live for the currently-deployed `full-kb` bot).
`kb_chunks` is populated live for all three clients (additive, inert until the mode flip deploys).
Remaining: `npx vercel --prod` to ship the code change — this is the point at which HFA and SAS Conserve move to `embeddings` mode along with Comm-Fit, per the accepted platform-wide consequence of `retrieval.mode` being a single global constant rather than per-client.

## Rollback

Pre-migration `guidelines.md`/`qa-samples.md` are recoverable from git history (both are tracked files, unlike the gitignored `/kb`).
`kb_chunks` ingestion is non-destructive to `full-kb` mode — reverting `config.retrieval.mode` to `"full-kb"` makes the new chunks inert immediately, no data loss, no re-ingestion needed to roll back.
