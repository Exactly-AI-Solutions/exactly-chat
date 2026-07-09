# Exactly Chat

A multi-tenant, white-label AI chat API. Each client company gets its own chat agent, grounded in that client's own knowledge base and answered in that client's voice.

## Language

**Client**:
A company that Exactly serves. Owns exactly one chat agent, one knowledge base, and its own API credentials. The unit of tenancy.
_Avoid_: Tenant, customer, account, organization.

**Chat Agent**:
The configured chatbot for a single client — its system prompt plus the supplemental documents (knowledge base, QA samples, guidelines) it answers from.
_Avoid_: Bot, assistant.

**Knowledge Base**:
A client's corpus of source material (e.g. ingested PDFs) about their company, chunked and embedded so relevant passages can be retrieved per question. The factual ground truth the agent answers from.
_Avoid_: KB (in prose), docs, corpus.

**QA Samples**:
A small, Exactly-curated set of **demonstrations** — canonical question/answer pairs and one or two full sample conversations — that teach the agent voice and behaviour *by example*. The "show" half of shaping *how* the agent answers. Injected wholesale into the system prompt.
_Avoid_: Canonical pairs, examples, few-shots.

**Guidelines**:
A client's explicit **stated rules** for how the agent should behave — tone, boundaries, dos and don'ts. The "tell" half of shaping *how* the agent answers, distinct from QA Samples' "show". Injected wholesale into the system prompt.
_Avoid_: Rules, instructions, policy.

**Conversation**:
One full end-to-end thread between an end user and a client's chat agent. The unit of persistence and the unit of transcript analysis.
_Avoid_: Thread, session, chat.

**Message**:
A single entry in a conversation, authored by either the end user or the chat agent.
_Avoid_: Turn, entry.

**End User**:
A visitor on the client's website who talks to the chat agent. Not an Exactly user and not the Client.
_Avoid_: User (ambiguous), visitor, customer.

**Widget**:
The Exactly-built chat UI embedded on a client's website. The only production caller of the API. Runs in the end user's browser and carries the client's API key.
_Avoid_: Embed, plugin, script.

**API Key**:
The credential naming a client, carried by that client's widget. Because it ships in browser code it is publishable, not secret — it identifies the client rather than proving privileged access.
_Avoid_: Token, secret, password.

**Domain Whitelist**:
The set of origins a given client's API key is allowed to be called from. Enforced against the request's `Origin`.
_Avoid_: Allowlist, CORS list.

**Agent Scoping**:
The constraint that keeps a chat agent answering only its client's subject matter and refusing general-purpose LLM tasks. Both a quality property and a security layer — a stolen agent is worthless off-topic.
_Avoid_: Guardrails (too broad), moderation.

**Usage Quota**:
A hard per-client ceiling on consumption (tokens or spend) over a period, beyond the per-minute rate limit. The backstop that caps abuse damage.
_Avoid_: Cap, budget, limit (ambiguous).
