# Scope: anonymous public FAQ only; PII handling deferred

Exactly Chat, at launch, serves **only** public-website FAQ chatbots handling **anonymous** end-user sessions. There are no current compliance constraints, and the product is deliberately scoped to this case.

Consequences, recorded so their deliberateness is unmistakable:

- **Transcripts are stored verbatim and retained indefinitely.** Conversations are persisted raw (no redaction at rest) — redaction would corrupt the exact data we persist transcripts to analyze ([[0001-server-authoritative-conversations]]), and the data is already access-controlled server-side. Whatever PII an end user happens to type is stored as-is.
- **No retention window and no PII controls are built.** This is intentional, not forgotten. The expensive-to-retrofit property — clean addressability and ownership — we already have: every conversation is hard-deletable by `conversation_id` and scoped by `client_id`. A retention-window purge and per-end-user deletion are therefore cheap to add later; we defer them until a real need appears.

**Explicitly out of scope for now:** chatbots for a client's *internal* use that would handle PII deliberately. If/when those are built, retention, redaction, and a formal PII policy must be revisited before they ship — the assumptions here (store raw, indefinite, no controls) do **not** carry over to a PII-handling product.
