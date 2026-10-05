# Comm-Fit — Mitch's six-point pre-Seth list, fixed 2026-10-05

Source: Mitch's comment thread (the "I do not want another broad cycle" note)
and the 9/23 #dev-team re-test ("your open items") confirming the same six
were still live as of 1:31pm that day.

Everything below is a change to the working tree only. It has **not been
pushed to the database or deployed** — see "What still has to happen" at the
end.

## 1. Scheduler wording

**Changed:** `client-config/comm-fit/guidelines.md` ("Booking a call or a
walkthrough") and `client-config/comm-fit/qa-samples.md` (Example 7, Example
23).

Removed "the scheduler is what locks that in," "it's locked in with our
team," and the QA annotation that said outright "the scheduler is the
confirmation." Replaced with a consistent, narrower claim: picking a time in
the scheduler **sends a request**; the team's own follow-up is what actually
confirms a meeting. Added an explicit guideline bullet forbidding any
language that implies the scheduler shows live/connected-calendar
availability or that a pick is itself a confirmation.

**This is Option B from Mitch's note (language/behavior change), not Option
A (connect a real calendar).** A real calendar connection is an
infrastructure/business decision outside this repo — the production embed
widget that renders the Calendly card lives on the client's site, not here,
and this session has no visibility into whether a real Calendly account is
wired to it. If Option A is still wanted, that's a separate piece of work
for whoever owns the embed/Calendly account, not a prompt change.

**Also flagged, not fixed (can't be fixed from this repo):** Mitch's note
that the API booking cue (`[[SCHEDULE_MEETING]]`) still doesn't appear to
fire, and the card opens from the widget's own typed-intent trigger instead.
That's a discrepancy between this backend's signal and the embed widget's
behavior — logged here explicitly, per Mitch's ask to keep it in the record
rather than let it pass as accidental.

## 2. Financing

**Changed:** `client-config/comm-fit/guidelines.md` (Facts and honesty) and
`client-config/comm-fit/qa-samples.md` (Example 13, new turn).

Rewrote the financing rule to state the NOT_FOUND framing explicitly: an
absence from the knowledge base is evidence the fact isn't published, not
evidence Comm-Fit doesn't offer it. The guideline now names the exact wrong
sentence ("No financing, leasing, or payment plan program is something we
offer") as forbidden, alongside the softened-yes version ("they may be able
to work through the timing with you"), and gives the sanctioned answer close
to Mitch's suggested wording. Added a worked example.

## 3. References

**Changed:** `client-config/comm-fit/guidelines.md` (Facts and honesty,
one-client bullet) and `client-config/comm-fit/qa-samples.md` (Example 7).

Removed the "a rep can pull examples closer to your project type" promise
everywhere it appeared. The bot now names Lincoln Property Company as the
one example, says plainly that's what's available, and stops — no promise
of a closer-matched reference bank the corpus doesn't support.

## 4. School answer (scope widening)

**Changed:** `client-config/comm-fit/guidelines.md` (Facts and honesty,
"Don't widen the business's own scope language") and
`client-config/comm-fit/qa-samples.md` (Example 17, new turn).

Traced the live failure to its actual source: `CF-580MNFPJ` in
`kb/comm-fit/commfit_kb.md`, the Education market page, says "our fitness
solutions are designed to be easily installed and even easier to clean and
maintain" — already a loose, self-describing claim. The live bot was
tightening that into "**Everything** is built to be easy to install..." and
adding an unstated inference ("which matters a lot in a school
environment"). The existing anti-widening guideline already named "our
fitness solutions" → "everything" as the failure shape in the abstract, but
evidently wasn't concrete enough to stop the live pattern — added the exact
phrase as a named wrong-answer and a worked example tying the feature back
to the product (FitDek / recycled rubber), not to "everything," with no
added rationale beyond what the source states.

## 5. Exactly pricing

**Changed:** `src/lib/prompt.ts` (`exactlyKnowledge`, the "What does it
cost" line). **This one needs a code deploy, not just a config push** — see
below.

Removed "Both figures are starting points — complexity prices up." The build
fee ($5,000) is still stated as a starting point, matching Pricing v1.1
("Starts at $5,000... complexity prices up"). The managed service ($2,000/mo
from go-live) is now stated flatly, with an explicit instruction never to
call it a starting point, per Mitch's direction.

**Where the bug actually came from:** traced to
`kb/comm-fit/mirror_test/Exactly_Meta_KB_v1_0-2.pdf`, entry 1. Its sanctioned
answer text itself says "it starts at $2,000 a month," and the italic
authoring note under it says "Both figures are starting points — complexity
prices up" — almost verbatim what was in `prompt.ts`. That note is explicitly
marked authoring-only ("must be compiled before it reaches a model... the
italic notes contain internal reasoning... and things the bot must never
say") but the runtime copy in this repo wasn't compiled down — it kept the
authoring framing. Pricing v1.1's own table describes the $2,000 figure as
"the standard and the floor; complex builds price above it," which is closer
to a floor than a starting point, but still isn't the flat "state it plainly,
don't call it a starting point" framing Mitch asked for here. **Worth a
version bump on the Meta KB / Pricing doc side** to reconcile the
authoring text with the conversational rule now in `prompt.ts` — flagging
for Mitch/Deb rather than editing those PDFs from here.

### Lightweight grounding pass on the Exactly layer (the second half of item 5)

Checked every bullet in `exactlyKnowledge()` against the three governed
sources (`Exactly_Meta_KB_v1_0`, `Exactly_Chatbot_Pricing_v1_1`,
`Exactly_Standard_Build_Scope_v0_2_1`, all approved 2026-09-10, Mitch + Deb).
Result: every claim traces to a LOCKED/BOUNDARY/DEFER entry or the Pricing/
Scope tables, with accurate paraphrase, except the one pricing bug above.
Specifically checked and confirmed grounded: build/monthly inclusions,
3-month term and cancellation language, ownership and the cross-deployment
data-isolation seam (correctly gated to "only if the visitor raises it,"
matching Meta KB entry 5's seam instruction), CRM/systems hard-no, roadmap
deferral, the meeting mechanics (who, prep, recording, reschedule), and the
hard-no-capability-doesn't-block-a-meeting rule. No further changes made to
this section beyond the pricing line.

## 6. Pushback / intake

**Changed:** `client-config/comm-fit/qa-samples.md` (new Example 25b).

The guideline rule itself ("answer why it matters and then stop — don't
continue the checklist") was already present in the working tree. No QA
example demonstrated it, which is a likely reason it wasn't holding up live.
Added a worked example showing the answer-then-stop shape and naming the
exact wrong pattern (justification immediately followed by "so, what's the
user base?").

## 7. Closed items — confirmed, no change needed

Research-mode → quote pressure, handoff + phone fallback, and cardio
comparison are unchanged in this pass — no new issues found. "Right at the
edge" is covered by the existing "recommended figure is not a fit boundary"
rule (same grounding principle as "just fits, no margin"); no separate
wording exists to fix.

## What still has to happen before this is live

Nothing here has been deployed. Per the existing deploy model:

- `guidelines.md` and `qa-samples.md` reach production only via
  `npm run set-config -- --client <comm-fit-id> --guidelines
  client-config/comm-fit/guidelines.md --qa client-config/comm-fit/qa-samples.md`
  (writes straight to the `clients` table — a production write, not run as
  part of this pass).
- `src/lib/prompt.ts` reaches production only via a code deploy (commit +
  push + the usual Vercel deploy), since it's compiled into the app rather
  than read from the database.

Once both are live, Mitch's six acceptance checks can be re-run against the
live chat API the same way the 9/23 re-test did.
