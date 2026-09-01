# Comm-Fit: canonical-conversation update (2026-09-01)

Comm-Fit supplied five new canonical conversations (`kb/comm-fit/Comm-Fit Canonicals 1-5.pdf`, gitignored) to model the bot's voice and logic after.
They demonstrate a noticeably different posture than the live `qa-samples.md` in two specific ways, not just tone: a firmer, elimination-logic diagnostic style, and a concrete-time booking flow ("I have Tuesday at 11:00... Booked.") in place of the async "brief, confirm, sent" pattern.
Directive from the client conversation: stick to the new canonicals as closely as possible, and remove anything in the existing config that contradicts them.

## What changed

**Diagnostic posture (`guidelines.md` → Posture, Resist the defaults).**
The old rule framed every read as a tentative hypothesis ("is that what you're seeing?"). The canonicals show something more specific: once the visitor has confirmed real numbers (six treadmills, three or four ever in use), the bot states the conclusion flatly — "Then it isn't capacity." That's not a hedge to soften; it follows by elimination from what the visitor just said. The rule now distinguishes a genuine hypothesis (still tentative, still offered as a possibility) from a deduction that's already earned by confirmed numbers.
Relatedly, "land, don't linger" was reframed — turn count was never really the target; padding and repetition are. A real diagnostic thread earns however many turns it needs.

**Booking mechanism (`guidelines.md` → Booking a call or a walkthrough, entirely rewritten).**
Comm-Fit's widget.json has no `scheduler` block — there's no real calendar behind this today (unlike HFA, which has the in-chat `[[SCHEDULE_MEETING]]` mechanism live). The canonicals ask for it anyway: concrete windows offered, a pick, "Booked." Per the client directive, the bot now does exactly that — offers two or three concrete-sounding windows, confirms "Booked" without hedging once the visitor picks one, then states a plain recap (no "sound right?" confirmation step, matching the canonicals exactly) and closes with a genuinely useful pre-call prep tip, a pattern the canonicals used consistently and the old config never had at all.
This is a known gap worth tracking: "Booked" is not backed by an actual calendar. If Comm-Fit wants a real one, HFA's `[[SCHEDULE_MEETING]]` mechanism is the proven path — needs a Comm-Fit scheduling link and widget-side embed work, scoped as its own piece of work, not done here.
One correctness addition beyond the canonicals: if a visitor's picked time doesn't match one of the offered windows, the bot now reads back the closest offered time rather than confirming a slot it never actually offered — caught in verification (see below).

**Handoff mechanism split (`guidelines.md` → Booking a call or a walkthrough, opening line; `qa-samples.md` Example 7).**
Not everything is now a scheduled call. Anything needing judgment or a real look at the space (quote, layout, walkthrough, repair visit) gets the new concrete-slot booking. A request with no judgment call in it (mailing-list signup, forwarding an unanswerable question) keeps the lighter async capture — no slot needed. Example 7's walkthrough sub-example, which previously said "I can't book the visit from here," was rewritten to use the real booking mechanism, since a walkthrough is exactly the kind of judgment-call request that now gets one.

**`qa-samples.md` — restructured, 15 → 19 examples.**
Kept everything that didn't contradict the canonicals (disinfection completeness, capabilities, curator posture, price/BuyBoard/founding-year fixes, link contract, gap-handling, register rule — all unaffected). Added adapted versions of all five canonicals as new examples (equipment/circulation, carpet/acoustics, new-build-no-chip, repair bundling, and the six-weeks timeline-pressure scenario that deliberately does *not* end in a booking — restraint still holds even with the firmer diagnostic voice). The repetitive booking-mechanics tail (property → size → role → name → email → slots) is spelled out in full once and abbreviated on repeat appearances, consistent with how this file already treats repeated mechanics elsewhere.

**"New Build" was a chip in Canonical 3 that doesn't exist in `widget.json`.**
Per the client conversation: don't add the chip, handle it as typed text under the existing Design & Layout routing. Reflected in the adapted example (Example 5) as a visitor describing a ground-up project in their own words, with a note that chips are invitations, never the boundary of what routes correctly.

## Known, accepted conflicts (flagged, not resolved here)

Two operational numbers repeated in the canonicals — 48-hour onsite response, 8–12 week project lead time — are graded `CONFLICTED` by the audit KB ingested in the RAG migration earlier today (48 vs. 72 hours depending on page; lead time published as 10-14/8-10/8-12 weeks across different pages). Both numbers were already live in the config before this pass and match the FAQ-page figures, so this isn't new risk introduced here — flagged for visibility, not treated as blocking, consistent with the client's "move fast, match the canonicals" instruction this round.

## Verification

Via `npm run dev` against the real Comm-Fit API key, real `/api/chat` endpoint.

- **Full flow, novel scenario (not the canonical's wording):** a strength-area/squat-rack-vs-dumbbell scenario, invented to test generalization rather than recitation. Diagnostic questions narrowed correctly, reached a flat elimination-logic conclusion once the visitor's own numbers were in ("if 4 racks are all waiting-listed at peak and half the dumbbells sit untouched, the fix is rebalancing the mix, not expanding the footprint"), booking mechanics ran in the right order (property → size → role → name → email last), concrete times were offered, "Booked" confirmed plainly, the recap was stated (not asked for approval), and the pre-call tip was genuinely tailored to the scenario rather than copied from the source example.
  Caught in this run: the visitor picked a time slightly off from what was offered, and the bot said "Booked" anyway without noticing — the mismatch-handling guideline line above was added in response and is a one-line, low-risk fix, not independently re-verified end-to-end.
- **Regression sweep:** BuyBoard, founding year, and spec-sheet-fabrication fixes from the earlier RAG-migration pass all still hold after the `qa-samples.md` rewrite. Disinfection completeness (all three offerings) unaffected. A "still deciding, not ready to talk to anyone" probe correctly declines to force a booking offer — restraint holds under the firmer diagnostic voice.

## Deploy status

Config-only change (`guidelines.md`/`qa-samples.md` via `set-config`) — no code change, so no `vercel --prod` step. Already live in production as of this writeup.
