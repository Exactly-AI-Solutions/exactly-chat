# Booking intent — the `[[SCHEDULE_MEETING]]` scheduler cue

How the chat API tells your widget to open the scheduler (Calendly) embed.

This is a small, self-contained addition to the existing chat integration.
Nothing else about how you call `POST /api/chat` changes — this is just one token to watch for in the reply you are already streaming.

---

## 1. The short version

- **You render the scheduler embed. We tell you *when*.**
- When the visitor has agreed to book, the streamed reply ends with a single token on its own final line: `[[SCHEDULE_MEETING]]`.
- Do two things: **strip that token from what you display**, and **render the scheduler when it appears**.
- **Remove any client-side "did they ask to book?" detection.** There is one trigger and it is ours (see §6 for why).

That's the whole feature. The rest of this doc is the how and the edge cases.

---

## 2. Why the signal comes from us

Your widget forwards each turn to the API and only ever sees the visitor's raw text on the way past.
The bot is the thing that decides what to say and when to offer a meeting, so the bot is the only place that actually knows a booking has landed.

If both sides detect intent, they disagree:

- A visitor asking "how much does coaching cost?" trips a client-side `cost|pricing|how much` regex, and the scheduler opens underneath a pricing answer.
- The bot offers to set up a call in wording your regex didn't anticipate, and nothing opens.

So detection lives with the bot, and it signals you on the one turn that matters.
One trigger, one place, and it works the same way across every site.

---

## 3. The token

```
[[SCHEDULE_MEETING]]
```

- It arrives **in-band, in the same plain-text stream** as the reply — no extra header, no second request, no protocol change.
- It appears **at most once per turn**, alone on the **final line** of the reply, only when the visitor has agreed to book.
- It is a **control signal, not content**. The visitor must never see it, and it never appears in the server-stored transcript.

Match it as an exact, literal string. It is always spelled exactly `[[SCHEDULE_MEETING]]`.

---

## 4. What to do with it

On each assistant turn, as you stream the reply:

1. **Strip the token from the displayed text.** Never show `[[SCHEDULE_MEETING]]` to the visitor.
2. **When the token is present, render the scheduler** (your Calendly embed) after that message.

### 4a. Strip it *as it streams* — buffer the tail

The reply arrives token by token, so the marker can land **split across two chunks**, e.g. you get `…time?\n[[SCHEDULE_ME` and then `ETING]]` on the next read.
If you only strip complete matches per chunk, that partial marker flashes on screen for a frame.

The fix: strip complete tokens, and also hold back any trailing text that is a *prefix* of the token until you know whether it completes.

```js
const TOKEN = "[[SCHEDULE_MEETING]]";

// Remove complete tokens, and hide a trailing partial token still streaming in.
function stripForDisplay(text) {
  let out = text.split(TOKEN).join("");
  for (let n = TOKEN.length - 1; n > 0; n--) {
    if (out.endsWith(TOKEN.slice(0, n))) {
      out = out.slice(0, -n);
      break;
    }
  }
  return out;
}

// True once the full token has arrived in the accumulated reply.
function shouldSchedule(text) {
  return text.includes(TOKEN);
}
```

Run `stripForDisplay` over the **accumulated** reply (not each raw chunk) every time you render.
Once `shouldSchedule(accumulated)` is true, open the embed once for that turn.

### 4b. Drop-in streaming loop

This is the standard streaming read with the two lines of cue handling added:

```js
async function sendMessage(message, { onText, onSchedule }) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message, conversationId }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  conversationId = res.headers.get("x-conversation-id") ?? conversationId;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let acc = "";
  let scheduled = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    acc += decoder.decode(value, { stream: true });

    onText(stripForDisplay(acc));           // render the cleaned, buffered text

    if (!scheduled && shouldSchedule(acc)) { // fire the embed once
      scheduled = true;
      onSchedule();
    }
  }
}
```

`onText` replaces the bubble's text with the cleaned version each time (idempotent — always pass the full accumulated text, not a delta).
`onSchedule` is where you mount the Calendly embed.

### 4c. Frameworks (React etc.)

Same idea: keep the raw accumulated string in state, and derive what you render.

```jsx
<div>{stripForDisplay(message.text)}</div>
{message.text.includes("[[SCHEDULE_MEETING]]") && <CalendlyEmbed />}
```

Because `stripForDisplay` and `includes` are pure functions of the accumulated text, you don't need extra flags — the embed renders as soon as the token is in the string and the text renders clean throughout.

---

## 5. Knowing a client has booking at all

The bootstrap call you already make on load advertises the capability:

```
GET /api/chat/config
```

```json
{
  "name": "Howorth Francis",
  "openingBubbles": ["…"],
  "chips": ["…"],
  "scheduler": { "enabled": true, "provider": "calendly" }
}
```

- `scheduler.enabled === true` → this client has in-chat booking; wire up the embed and watch for the token.
- `false` or the field absent → there is no booking cue to handle for this client; the token will never appear.

Use this to switch the behaviour on per site without a code change on your end.

---

## 6. When it fires — and when it doesn't

So you can sanity-check your handling:

| Visitor / situation | Token? |
|---|---|
| "Yes, let's set up a time" / "How do I book?" / a clear yes to meeting | **Yes** |
| "How much does it cost?" / "Do you work remotely?" / "What happens in a session?" | No |
| The bot *offers* a meeting the visitor hasn't accepted yet | No |
| Visitor says "let me think about it" | No |
| Visitor says "just have them email me instead" | No (that stays a conversational hand-off) |

It fires on a clear yes to booking, and nothing softer.
If you see it firing anywhere in the "No" rows, tell us — that's a bot-side tuning issue, not something you should paper over on the client with a filter.

---

## 7. Do / don't

- **Do** strip the token from every rendered frame, buffering the split-chunk tail (§4a).
- **Do** render the embed off the token, and only the token.
- **Do** gate on `scheduler.enabled` from `/api/chat/config` (§5).
- **Don't** add or keep any keyword/regex intent detection on the visitor's text — that's the double-detector problem this design removes.
- **Don't** display, log to the visitor, or persist the token; treat it as a transient signal.

---

## 8. Quick test checklist

1. Ask a pricing question → you get a normal answer, **no** embed.
2. Describe a problem so the bot offers a meeting, but don't accept → **no** embed.
3. Say "yes, let's set up a time" → the reply reads cleanly (no `[[…]]` visible, not even for a frame) and the scheduler embed appears once.
4. Say "just email me instead" → **no** embed; the bot collects details conversationally.

If all four behave as above, you're done.

---

*Questions on the cue, or seeing it fire in the wrong place? That's on us — send the conversation and we'll tune the bot.*
