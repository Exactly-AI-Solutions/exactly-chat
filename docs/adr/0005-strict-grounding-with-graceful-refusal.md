# Strict grounding with graceful refusal

The agent answers **only** from retrieved Knowledge Base context. Similarity search results below a relevance threshold are discarded; if nothing clears the threshold, the agent is instructed that it has no supporting context and must **decline smoothly** — a graceful, voice-governed deflection ("I can only help with questions about {Client}…") — rather than fall back to the model's general knowledge.

This is the concrete mechanism behind Layer-B agent scoping (see [[0002-publishable-key-layered-abuse-defense]]). The product priority is: confidently answer what the Knowledge Base supports, in the client's voice, and freely decline anything else. Two things depend on it — a stolen agent that refuses everything off-topic is worthless as a free LLM, and a company support bot that never answers from ungrounded general knowledge won't confidently make things up.

Do **not** add a "answer from general knowledge when the KB has nothing" fallback. It would feel more helpful but reintroduces hallucination and re-opens the free-LLM abuse Layer B exists to close. The similarity threshold is tunable against real KBs (too high causes false refusals); the *posture* — drop below-threshold chunks and decline — is the fixed decision.
