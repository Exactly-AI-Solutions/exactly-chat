# Server-authoritative conversation history

Conversations are persisted server-side and the database is the source of truth for their message history. A chat request carries a `conversationId` plus the new end-user message, not the full transcript; the server loads prior messages, runs the model, and persists the new messages.

We chose this over the stock Vercel AI SDK `useChat` shape (browser sends the full `messages` array each turn, DB mirrors it). The committed driver is **trustworthy transcript analysis**: because the server owns history, a client cannot trim, edit, or diverge from the record we analyze. The cost is a DB read per turn and a custom widget protocol instead of the default convention.

A secondary, **non-committed** benefit is that this leaves the door open to a possible future "resume a conversation from a link" feature — nothing is built for it now, but server-owned history plus a stable, unguessable, tenant-scoped `conversation_id` means resume could be added later (a read endpoint + a widget entry point) without rewriting anything. Resume is not a requirement; do not build for it until it is decided.
