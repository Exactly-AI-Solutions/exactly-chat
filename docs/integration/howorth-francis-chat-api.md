# Howorth Francis Chat API — Integration Guide

A hosted chat API. You build the chat UI; the API handles authentication, knowledge retrieval, the language model, and conversation state. One request streams a grounded assistant reply; another returns the opening greeting and quick-reply chips.

---

## 1. Base URL

```
https://exactly-chat.vercel.app
```

## 2. Authentication

Every request needs an API key, sent as a Bearer token:

```
Authorization: Bearer eck_5951a823ff14c36e_0SEvjCecH5swi1aA_--w6BJXYE3pOPhL
```

This key is **publishable** — it is designed to live in front-end code (like a Stripe publishable key). It identifies the client; it is not a secret. The real access controls are the domain whitelist (below) and per-client usage limits.

## 3. Domain whitelist — read this first

The API only accepts browser requests from **whitelisted origins**. Any request from a non-whitelisted origin returns **403**.

**Send us every origin you will call from** — local dev, staging, and the production site — and we'll add them. For example:

```
http://localhost:5173
https://staging.howorthfrancis.com
https://howorthfrancis.com
```

Already whitelisted: `http://localhost:3000`, `https://exactly-chat.vercel.app`, and your demo site `https://xa-mirror-howorth-francis.vercel.app`.

> Note: the origin is your site's origin (scheme + host + port), not a path. `http://localhost:3000` and `http://localhost:5173` are different origins.

## 4. Endpoints

### `GET /api/chat/config` — the opening

Call once when the widget loads. Returns the greeting bubbles and the quick-reply chips.

Request headers: `Authorization: Bearer <key>`

Response (JSON):

```json
{
  "name": "Howorth Francis",
  "openingBubbles": [
    "Most teams don't struggle because people lack skills. They struggle because important things stop getting said.",
    "What are you seeing on your team?"
  ],
  "chips": ["Team's struggling", "Major changes are happening", "Communication issues", "Something else", "Questions about HFA"],
  "scheduler": { "enabled": true, "provider": "calendly" }
}
```

Render each `openingBubbles` entry as an assistant message. Render `chips` as quick-reply buttons; tapping a chip is equivalent to sending its label as the first message.

`scheduler` tells you whether in-chat booking is on for this client (see §5). When `enabled` is `true`, be ready to render the Calendly embed; the bot tells you *when* on each turn via the stream (§5). When it's `false` or absent, there is no booking cue to handle.

### `POST /api/chat` — send a message, stream the reply

Request headers:

```
Authorization: Bearer <key>
Content-Type: application/json
```

Request body:

```json
{ "message": "our senior people have checked out since a restructure", "conversationId": "optional" }
```

- **First message of a conversation:** omit `conversationId`.
- The response body is a **stream of plain text** — the assistant's reply, arriving token by token. Read it as a stream and append to the UI as it arrives.
- Read the **`x-conversation-id`** response header and send it back as `conversationId` on every subsequent message to continue the same conversation. Conversation history lives on the server; you only need to remember this id.

## 5. Booking intent — the scheduler cue

You render the Calendly embed; **we tell you when to show it.** The bot is the only party that knows a booking has actually landed — it is the thing making the offer — so detection lives with us, not with a keyword matcher on your side. This means: **remove any client-side intent detection.** A regex on the visitor's text will fire on "how much does it cost" (a pricing question, not a booking) and miss a booking the bot phrases in words your pattern didn't anticipate. There is one trigger, and it's ours.

**How the cue arrives.** When — and only when — the visitor has agreed to book and the bot is inviting them to pick a time, the streamed reply ends with a single control token, alone on the final line:

```
[[SCHEDULE_MEETING]]
```

That token is **in-band, in the same plain-text stream** as the reply — no protocol change, no extra header, no second request. Your job on each turn is:

1. **Strip the token from what you display.** Never show `[[SCHEDULE_MEETING]]` to the visitor.
2. **When the token is present, render the scheduler** (Calendly embed) after that message.

**Strip it as it streams — buffer the tail.** Because the reply arrives token by token, the marker can land split across two chunks (e.g. `…time?\n[[SCHEDULE_ME` then `ETING]]`). If you strip only complete matches per chunk, a partial marker flashes for a frame. Hold back any trailing text that is a prefix of the token until you know whether it completes:

```js
const TOKEN = "[[SCHEDULE_MEETING]]";

// Remove complete tokens, and hide a trailing partial token still streaming in.
function stripForDisplay(text) {
  let out = text.split(TOKEN).join("");
  for (let n = TOKEN.length - 1; n > 0; n--) {
    if (out.endsWith(TOKEN.slice(0, n))) { out = out.slice(0, -n); break; }
  }
  return out;
}

const shouldSchedule = (fullText) => fullText.includes(TOKEN);
```

Run `stripForDisplay` over the **accumulated** reply text on each render, and call your embed once `shouldSchedule(accumulatedText)` is true. The token never appears in the server-stored transcript, and it is emitted at most once per turn.

**When it does *not* fire** (so you can sanity-check): questions about price, availability, or what a meeting involves; the bot merely *offering* a meeting the visitor hasn't accepted; a visitor who says "just have them email me" (that path stays a conversational hand-off, no embed). It fires on a clear yes to booking, nothing softer.

## 6. Errors

Errors return JSON `{ "error": "..." }` with an HTTP status:

| Status | Meaning |
|--------|---------|
| 400 | Missing or invalid body (e.g. no `message`) |
| 401 | Missing or invalid API key |
| 403 | Origin not whitelisted (see §3) |
| 404 | Unknown `conversationId` |
| 500 | Server error |

## 7. Example (vanilla JS, streaming)

```js
const BASE = "https://exactly-chat.vercel.app";
const API_KEY = "eck_5951a823ff14c36e_0SEvjCecH5swi1aA_--w6BJXYE3pOPhL";
let conversationId = null;

// 1. Load the opening once
async function loadOpening() {
  const res = await fetch(`${BASE}/api/chat/config`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return res.json(); // { name, openingBubbles, chips }
}

// 2. Send a message and stream the reply. `onToken` is called with each chunk.
async function sendMessage(message, onToken) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ message, conversationId }),
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`${res.status}: ${error}`);
  }

  // Remember the conversation id for the next turn
  conversationId = res.headers.get("x-conversation-id") ?? conversationId;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}

// Usage
// const opening = await loadOpening();
// await sendMessage("Questions about HFA", (t) => appendToUI(t));
```

## 8. Behaviour notes

- The assistant answers **only** from Howorth Francis's knowledge base and **declines off-topic requests** (it won't act as a general-purpose assistant). Test with questions about the firm, the founders, their approach, engagement/pricing, and team situations.
- Replies are intentionally **short** (a sentence or two) — the chat is designed to read in glances.
- **Conversation state is server-side.** The only thing you persist client-side is `conversationId` (e.g. in `localStorage`) if you want a visitor to resume after a refresh.
- **Booking is signalled, not detected client-side** (§5). Strip the `[[SCHEDULE_MEETING]]` token from display and render the scheduler when it appears; do not add your own keyword trigger.

## 9. Live reference implementation

A working reference UI is deployed at:

```
https://exactly-chat.vercel.app/demo
```

Paste the API key and try it — this shows the exact expected behaviour (opening bubbles, chips, streaming, grounded answers, graceful declines). Use it to compare against your own integration. It also shows the booking cue (§5): agree to a meeting and the reference UI strips the token and marks where the scheduler embed would render.
