# Comm-Fit Chat API — Integration Guide

A hosted chat API. You build the chat UI; the API handles authentication, knowledge retrieval, the language model, and conversation state. One request streams a grounded assistant reply; another returns the opening greeting and quick-reply chips.

---

## 1. Base URL

```
https://exactly-chat.vercel.app
```

## 2. Authentication

Every request needs an API key, sent as a Bearer token:

```
Authorization: Bearer eck_b95a55bf585d01f5_IfT83IB_N7-kVUln08ZEqgjep-P806LH
```

This key is **publishable** — it is designed to live in front-end code (like a Stripe publishable key). It identifies the client; it is not a secret. The real access controls are the domain whitelist (below) and per-client usage limits.

## 3. Domain whitelist — read this first

The API only accepts browser requests from **whitelisted origins**. Any request from a non-whitelisted origin returns **403**.

**Send us every origin you will call from** — local dev, staging, and the production site — and we'll add them. For example:

```
http://localhost:5173
https://staging.comm-fit.com
https://comm-fit.com
```

Already whitelisted: `https://comm-fit-concierge.vercel.app`, `https://comm-fit-clone-v2.vercel.app`, and `http://localhost:3000` (local dev). Send us the rest — staging, production, and your local dev URL if it's on a different port (e.g. `http://localhost:5173` for Vite) — and we'll add them instantly.

> Note: the origin is your site's origin (scheme + host + port), not a path and with no trailing slash. `http://localhost:3000` and `http://localhost:5173` are different origins; `https://comm-fit.com` and `https://comm-fit.com/` are treated as the same origin by the browser (it always sends the slash-less form).

## 4. Endpoints

### `GET /api/chat/config` — the opening

Call once when the widget loads. Returns the greeting bubbles and the quick-reply chips.

Request headers: `Authorization: Bearer <key>`

Response (JSON):

```json
{
  "name": "Comm-Fit",
  "openingBubbles": [
    "Fitness Facility Solutions For Your Space.",
    "What brings you to Comm-Fit today?"
  ],
  "chips": ["Design a facility", "Buy equipment", "Flooring", "Disinfection", "Service & repair", "Something else"]
}
```

Render each `openingBubbles` entry as an assistant message. Render `chips` as quick-reply buttons; tapping a chip is equivalent to sending its label as the first message.

### `POST /api/chat` — send a message, stream the reply

Request headers:

```
Authorization: Bearer <key>
Content-Type: application/json
```

Request body:

```json
{ "message": "we manage a 5,000 sq ft apartment amenity gym and need new flooring", "conversationId": "optional" }
```

- **First message of a conversation:** omit `conversationId`.
- The response body is a **stream of plain text** — the assistant's reply, arriving token by token. Read it as a stream and append to the UI as it arrives.
- Read the **`x-conversation-id`** response header and send it back as `conversationId` on every subsequent message to continue the same conversation. Conversation history lives on the server; you only need to remember this id.

## 5. Errors

Errors return JSON `{ "error": "..." }` with an HTTP status:

| Status | Meaning |
|--------|---------|
| 400 | Missing or invalid body (e.g. no `message`) |
| 401 | Missing or invalid API key |
| 403 | Origin not whitelisted (see §3) |
| 404 | Unknown `conversationId` |
| 500 | Server error |

## 6. Example (vanilla JS, streaming)

```js
const BASE = "https://exactly-chat.vercel.app";
const API_KEY = "eck_b95a55bf585d01f5_IfT83IB_N7-kVUln08ZEqgjep-P806LH";
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
// await sendMessage("Flooring", (t) => appendToUI(t));
```

## 7. Behaviour notes

- The assistant answers **only** from Comm-Fit's knowledge base and **declines off-topic requests** (it won't act as a general-purpose assistant). Test with questions about the six pillars — design & layout, equipment, flooring, disinfection, service & repair, and installation — plus lead times, service areas, and "why Comm-Fit."
- **It will not invent numbers.** The only firm published price is that service calls start at $125; every other price is quote-dependent, so the assistant says so plainly and offers to get an exact figure rather than guessing one. It also won't fabricate specs, model availability, warranty terms, competitor names, or people.
- Replies are intentionally **short** — typically 30–80 words, never more than 120, except when a visitor asks what Comm-Fit offers, where the assistant gives the full set (all three disinfection products, all six pillars) as a list and may run to ~150.
- **Render the reply with line breaks preserved** (e.g. `white-space: pre-wrap`). The assistant deliberately breaks replies into short paragraphs separated by blank lines, and formats scope answers as `- ` bulleted lines. Do not collapse the newlines, or the formatting is lost and replies read as dense blocks.
- **Links are the one markdown construct in the output.** The assistant emits inline links as `[label](https://…)` — for example a flooring product page or a spec-sheet PDF — because a bare URL is not clickable. Nothing else is markdown: no bold, no headings, no tables, no italics.
  Render `[label](url)` as an anchor (`target="_blank" rel="noopener noreferrer"`), and escape the reply text **before** applying the link markup so a reply can never inject HTML. Only `https://comm-fit.com/…` URLs are ever emitted.
  If you would rather not parse anything, the raw `[label](url)` text still reads acceptably — but the visitor loses the click, which was a specific piece of feedback from Comm-Fit.
- **It does not push for a quote.** It answers what was asked, and only offers a quote, layout, or rep call once the visitor has what they came for or signals interest — at most twice in a conversation. It won't raise price unprompted.
- **It completes requests in-chat rather than redirecting.** Mailing-list signups, case-study asks, and walkthrough requests are captured conversationally and passed to a rep; the assistant won't tell a visitor to email or call to make a request it can take itself. It surfaces **1-877-479-4444** when a visitor wants to talk to someone now or a repair is time-sensitive.
- **Flooring product pages are linked directly.** Each of the eight flooring products has a comm-fit.com detail page; "where can I read more" and "can I download the spec sheet" are both answered with that link (the page itself carries the spec-sheet download), not with a rep follow-up or an email capture. Equipment and disinfection questions still route to a rep.
- **It asks for contact details at most once at a time.** A visitor who hits several unknowns in a row will not be asked for an email address on every turn; the first ask stays open and later items attach to it.
- **It cannot book a specific time.** There is no calendar in the chat, so for a call or an on-site walkthrough it captures the details and a preferred window for a rep to confirm. (In-chat scheduling is available as a platform feature — ask us if Comm-Fit wants it enabled.)
- **Conversation state is server-side.** The only thing you persist client-side is `conversationId` (e.g. in `localStorage`) if you want a visitor to resume after a refresh.

## 8. Live reference implementation

A working reference UI is deployed at:

```
https://exactly-chat.vercel.app/demo
```

Paste the API key to see the exact expected behaviour (opening bubbles, chips, streaming, grounded answers, graceful declines) and compare against your own integration.

> This hosted demo calls from the `https://exactly-chat.vercel.app` origin, which is **not** yet whitelisted for the Comm-Fit key — ask us to enable it (or test from your own whitelisted origin, `https://comm-fit-concierge.vercel.app`).
