# Reunited Clothing Chat API — Integration Guide

A hosted chat API. You build the chat UI; the API handles authentication, knowledge retrieval, the language model, and conversation state. One request streams a grounded assistant reply; another returns the opening greeting and quick-reply chips.

---

## 1. Base URL

```
https://exactly-chat.vercel.app
```

## 2. Authentication

Every request needs an API key, sent as a Bearer token:

```
Authorization: Bearer eck_3c56d1c0e777fc2a_P4rSDsAt2rORV8xinyNV_RAaDp4nMoQO
```

This key is **publishable** — it is designed to live in front-end code (like a Stripe publishable key). It identifies the client; it is not a secret. The real access controls are the domain whitelist (below) and per-client usage limits.

## 3. Domain whitelist — read this first

The API only accepts browser requests from **whitelisted origins**. Any request from a non-whitelisted origin returns **403**.

Already whitelisted: `https://reunited-clothing.vercel.app`, `http://localhost:3000` (local dev), and `https://exactly-chat.vercel.app` (the hosted demo, §8). **Send us every other origin you'll call from** — staging, a different local dev port, any additional preview deployments — and we'll add them instantly (no redeploy).

> Note: the origin is your site's origin (scheme + host + port), not a path and with no trailing slash. `http://localhost:3000` and `http://localhost:5173` are different origins; `https://reunited-clothing.vercel.app` and `https://reunited-clothing.vercel.app/` are treated as the same origin by the browser (it always sends the slash-less form).

## 4. Endpoints

### `GET /api/chat/config` — the opening

Call once when the widget loads. Returns the greeting bubbles and the quick-reply chips.

Request headers: `Authorization: Bearer <key>`

Response (JSON):

```json
{
  "name": "Reunited Clothing",
  "openingBubbles": [
    "Reunited Clothing designs and manufactures private label apparel for retailers and brands, and builds collaborations with talent.",
    "What are you working on?"
  ],
  "chips": ["Private Label", "Develop My Brand's Line", "A Collaboration", "Talent for a Brand", "Something Else"],
  "scheduler": { "enabled": false, "provider": null }
}
```

Render each `openingBubbles` entry as an assistant message. Render `chips` as quick-reply buttons; tapping a chip is equivalent to sending its label as the first message. `scheduler.enabled` is `false` for this client — see §7, booking is handled entirely in chat text, there is no separate scheduler embed to render.

### `POST /api/chat` — send a message, stream the reply

Request headers:

```
Authorization: Bearer <key>
Content-Type: application/json
```

Request body:

```json
{ "message": "What's your MOQ for a sweater program?", "conversationId": "optional" }
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
const API_KEY = "eck_3c56d1c0e777fc2a_P4rSDsAt2rORV8xinyNV_RAaDp4nMoQO";
let conversationId = null;

// 1. Load the opening once
async function loadOpening() {
  const res = await fetch(`${BASE}/api/chat/config`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return res.json(); // { name, openingBubbles, chips, scheduler }
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
// await sendMessage("Private Label", (t) => appendToUI(t));
```

## 7. Behaviour notes

- **This is a prospect sales mirror, not a production commercial configuration.** It's built from Reunited's own public website plus a clearly-labeled set of illustrative planning figures, so it can speak to pricing/MOQ/timing questions the real site doesn't publish. None of those figures are Reunited's confirmed terms.
- **Render the markdown `<sub>` note as inline text, not literal markup.** Any reply that states a pricing, MOQ, percentage, or timing figure from the illustrative layer carries `<sub>*Illustrative, not from Reunited's KB*</sub>` directly in the stream. If your UI renders markdown, this shows as small italic text under the figure; if it renders plain text, it'll show the raw tag — decide which you want and style accordingly, but don't strip it, it's a required disclosure on every turn that states such a figure.
- **Booking has no separate scheduler UI to build.** Unlike other Exactly-built chatbots, this one doesn't open a Calendly embed (`scheduler.enabled` is `false`, §4). The conversion flow — role → name → email → three offered times → "Booked." → a recap — happens entirely as chat text. The widget's first screen should show this disclosure once, up front (the assistant will quote it back verbatim only if a visitor directly asks what it's built from):

  > Built from the company's public website and selected public sources. Where those sources don't answer, clearly marked illustrative industry guidance may be used and is not the company's policy or terms. Times and confirmations here are examples of the production experience; no appointment is created. Production is built from information and operating knowledge the client supplies or approves.

- **It will not invent facts.** The assistant answers only from Reunited's own knowledge base and the fixed illustrative set above; it declines off-topic requests. It will never state a phone number (none is published — routes to `contact@reunitedclothing.com` or a booked conversation instead), never name a competitor or an unconfirmed retailer/brand partner, and never assert a certification or sustainability target as current when the site's own dates on them have passed.
- **The founder question gets a direct, sourced answer, not a deflection** — e.g. "Who founded Reunited?" returns the Founders page's named list; a direct question about Hilda Batayneh gets a press-attributed answer. It won't volunteer this topic or resolve the site's own inconsistency on it.
- Replies run roughly 200 words, one call-to-action per message, warm and fashion-fluent in tone.
- **Conversation state is server-side.** The only thing you persist client-side is `conversationId` (e.g. in `localStorage`) if you want a visitor to resume after a refresh.

## 8. Live reference implementation

A working reference UI is deployed at:

```
https://exactly-chat.vercel.app/demo
```

Paste the API key to see the exact expected behaviour (opening bubbles, chips, streaming, grounded answers, the illustrative-figure disclosure, graceful declines) and compare against your own integration. This origin is already whitelisted for the Reunited key, so the hosted demo works without any extra setup.
