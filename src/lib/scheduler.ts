/**
 * Booking-intent signaling (the Calendly cue).
 *
 * The mirror bot is the only party that knows when booking intent has landed —
 * it is the thing making the offer. So detection lives with the model, not with
 * a second keyword matcher in the embedding widget: when (and only when) the
 * visitor has agreed to book, the model ends its message with a single control
 * token. The widget strips that token from the displayed text and renders the
 * scheduler embed on its cue; the server strips it before persistence so history
 * and analytics stay clean. This rides in-band on the existing plain-text stream
 * (ADR-0001 / `toTextStreamResponse`) — no wire-protocol change for any widget.
 *
 * This module is the single source of truth for the token, imported by the
 * prompt scaffold (producer instruction), the chat route (persistence strip),
 * and the demo widget (display strip). It has no server-only dependencies so the
 * client widget can share the exact same constant.
 */

/** The canonical control token. Emitted verbatim by the model, on its own line. */
export const SCHEDULE_TOKEN = "[[SCHEDULE_MEETING]]";

/** True if the assistant text carries the scheduler cue. */
export function hasScheduleToken(text: string): boolean {
  return text.includes(SCHEDULE_TOKEN);
}

/**
 * Remove every complete cue token (and the trailing whitespace it sat on) from
 * assistant text. Used server-side before persistence and as the base for the
 * display strip. Complete tokens only — a legitimate trailing "[" survives.
 */
export function stripScheduleToken(text: string): string {
  return text
    .split(SCHEDULE_TOKEN)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .trimEnd();
}

/**
 * Display-time strip that ALSO hides a partial token still arriving in the
 * stream (e.g. "…time?\n[[SCHEDULE_ME"), so the cue never flashes before it
 * completes. This is the "buffer the tail" behaviour an embedding widget needs
 * when it renders the raw stream token-by-token.
 */
export function stripScheduleTokenForDisplay(text: string): string {
  let out = stripScheduleToken(text);
  for (let n = SCHEDULE_TOKEN.length - 1; n > 0; n--) {
    if (out.endsWith(SCHEDULE_TOKEN.slice(0, n))) {
      out = out.slice(0, -n);
      break;
    }
  }
  return out.trimEnd();
}

/**
 * The producer-side instruction, injected into the system prompt only for
 * clients whose config enables the scheduler. Provider-agnostic: the widget owns
 * which scheduler (Calendly, etc.) actually renders.
 */
export function schedulerInstruction(clientName: string): string {
  return [
    `## Booking a meeting`,
    `${clientName} can book meetings directly in the chat: when the visitor is ready, a scheduler opens inside the chat window and they pick a time themselves. You do not collect a date, time, or availability, and you never claim to have booked a specific slot — the scheduler handles that.`,
    ``,
    `When — and only when — the visitor has clearly agreed to book or asked to schedule a meeting, and your message invites them to pick a time as the immediate next step, end that message with this exact marker, alone on the final line, with nothing after it:`,
    ``,
    SCHEDULE_TOKEN,
    ``,
    `Rules for the marker:`,
    `- Offering a meeting is NOT the signal — the visitor *agreeing to book* is. Do not emit it while the visitor is still deciding, thinking it over, or has only been offered a meeting.`,
    `- A question about price, availability, remote delivery, or what a meeting involves is NOT a booking signal. Answer it normally, with no marker.`,
    `- Emit it at most once, only on the turn where you actually present the scheduler.`,
    `- It is a silent control signal. Never explain it, mention it, or hint at it — write your normal short message inviting them to pick a time, then place the marker on the last line.`,
  ].join("\n");
}
