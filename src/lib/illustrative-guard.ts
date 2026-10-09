/**
 * Deterministic backstop for Reunited's illustrative-figure label ([P2-L2])
 * and banned builder-language ([P2-N1]), per Mitch's governed behaviour layer
 * (kb/reunited/reunited_clothing_behaviour_v0.5.1_mirror_p1.md, "CODE GUARDS
 * — 2026-09-29"). client-config/reunited/guidelines.md already states both
 * rules in prose; this exists because prompt-only compliance drops under
 * repetition (a figure that's merely repeated/recalculated, not freshly
 * stated, per the 2026-10-05 Mitch-gate feedback: label present on 7/15
 * figure-bearing turns, missing on every repeat and on the payment-terms
 * turn) and under pressure (a visitor asking the bot to drop the disclosure,
 * which pulled "the note" — the mechanism's internal name — into the reply).
 *
 * Scoped by client name for now (see `getOutputGuard`) rather than a new
 * widget_config field, since only Reunited needs it today; generalize to a
 * per-client config block if a second client needs the same backstop.
 */

export type OutputGuard = {
  /** Exact markdown the disclosure label must appear as, verbatim. */
  label: string;
  /** True if `text` states a figure that requires the label. */
  needsLabel: (text: string) => boolean;
  /** Patterns for leaked internal/builder language — all carry the `g` flag. */
  bannedPhrases: RegExp[];
  /** Last-resort, regex-based cleanup when a model rewrite still trips a banned phrase. */
  minimalRewrite: (text: string) => string;
};

// Reunited's published site carries no pricing/MOQ/timing/royalty figures at
// all (guidelines.md, "Illustrative planning figures"; RCI-001), so any
// dollar RANGE, a commercial percentage, a week-long lead-time range, or a
// unit/style/color count can only come from the illustrative layer. Ranges
// are the safe signal throughout: Reunited's one real published figure that
// looks like these (the 70%-by-2025 sustainability pledge, RC-045) is always
// a single bare number, never a range, and never paired with the commercial
// vocabulary ("deposit", "royalty", "wholesale", "talent fee", "agency fee",
// "shipping documents") the illustrative percentages always carry.
const DOLLAR_RANGE = /\$\s*\d[\d,]*(?:\.\d+)?\s*[-–—−]\s*\$?\s*\d[\d,]*(?:\.\d+)?/;
const PERCENT_RANGE = /\d{1,3}\s*[-–—−]\s*\d{1,3}\s*%/;
const PERCENT_SINGLE = /\d{1,3}(?:\.\d+)?\s*%/;
const COMMERCIAL_PERCENT_CONTEXT =
  /\b(deposit|royalt(?:y|ies)|wholesale|talent fee|agency fee|service fee|commission|shipping documents|cash[- ]flow)\b/i;
const WEEK_RANGE = /\d{1,3}\s*[-–—−]\s*\d{1,3}\s*weeks?\b/i;
const UNIT_COUNT = /\b(?:units?|pieces?|per\s+style|per\s+color|\/\s*style|\/\s*color)\b/i;

function reunitedNeedsLabel(text: string): boolean {
  if (!/\d/.test(text)) return false;
  if (DOLLAR_RANGE.test(text)) return true;
  if (PERCENT_RANGE.test(text)) return true;
  if (PERCENT_SINGLE.test(text) && COMMERCIAL_PERCENT_CONTEXT.test(text)) return true;
  if (WEEK_RANGE.test(text)) return true;
  if (UNIT_COUNT.test(text)) return true;
  return false;
}

/**
 * Insert `label` as its own paragraph before the reply's final paragraph
 * (the closing question) — [P2-L2] requires the note never land after it.
 * Falls back to appending at the end for a single-paragraph reply.
 */
export function insertLabel(text: string, label: string): string {
  const trimmed = text.trimEnd();
  const paragraphs = trimmed.split(/\n\n+/);
  if (paragraphs.length >= 2) {
    const last = paragraphs.pop() as string;
    return [...paragraphs, label, last].join("\n\n");
  }
  return `${trimmed}\n\n${label}`;
}

// [P2-N1], plus the 2026-09-30 ("the note") and 2026-09-29 ("simulated"/
// demo/mirror) additions. All carry `g` so `.match`/`.replace` catch every
// occurrence in one pass.
const REUNITED_BANNED_PHRASES: RegExp[] = [
  /\bthe illustrative note\b/gi,
  /\bthe note\b/gi,
  /\bthis layer\b/gi,
  /\bplanning layer\b/gi,
  /\billustrative layer\b/gi,
  /\bscenario selected\b/gi,
  /\bRCI?-\d+\b/gi,
  /\bRCI\b/gi,
  /\bsimulat(?:ed|ion)\b/gi,
  /\bdemo\b/gi,
  /\bmirror\b/gi,
];

function reunitedMinimalRewrite(text: string): string {
  return text
    .replace(/\bthe illustrative note\b/gi, "that disclosure")
    .replace(/\bthe note\b/gi, "that disclosure")
    .replace(/\bthis layer\b/gi, "that")
    .replace(/\bplanning layer\b/gi, "the planning figures")
    .replace(/\billustrative layer\b/gi, "those figures")
    .replace(/\bscenario selected\b/gi, "the scenario used")
    .replace(/\bRCI?-\d+\b/gi, "")
    .replace(/\bRCI\b/gi, "this example")
    .replace(/\bsimulated\s+/gi, "")
    .replace(/\bsimulation\b/gi, "process")
    .replace(/\bthis demo\b/gi, "this")
    .replace(/\bdemo\b/gi, "")
    .replace(/\bmirror\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?])/g, "$1")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

const REUNITED_LABEL = "<sub>*Illustrative, not from Reunited's KB*</sub>";

const REUNITED_GUARD: OutputGuard = {
  label: REUNITED_LABEL,
  needsLabel: reunitedNeedsLabel,
  bannedPhrases: REUNITED_BANNED_PHRASES,
  minimalRewrite: reunitedMinimalRewrite,
};

const GUARDS_BY_CLIENT_NAME: Record<string, OutputGuard> = {
  "Reunited Clothing": REUNITED_GUARD,
};

/** The output guard for a client, by name, or null if none is configured. */
export function getOutputGuard(clientName: string): OutputGuard | null {
  return GUARDS_BY_CLIENT_NAME[clientName] ?? null;
}

/** Every banned-phrase match in `text` (lowercased), or `[]` if clean. */
export function findBannedPhrases(guard: OutputGuard, text: string): string[] {
  const hits: string[] = [];
  for (const pattern of guard.bannedPhrases) {
    const matches = text.match(pattern);
    if (matches) hits.push(...matches.map((m) => m.toLowerCase()));
  }
  return hits;
}

/** Append the required label, if missing, to a reply that states a figure. */
export function applyLabelGuard(guard: OutputGuard, text: string): string {
  if (guard.needsLabel(text) && !text.includes(guard.label)) {
    return insertLabel(text, guard.label);
  }
  return text;
}
