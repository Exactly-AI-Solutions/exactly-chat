import type { KbMatch, SchedulerConfig } from "./data";
import { schedulerInstruction } from "./scheduler";

/**
 * The global prompt scaffold (ADR-0006 — lives in code, not Langfuse). Wraps the
 * per-client wholesale content (Guidelines, QA Samples) and the Knowledge base
 * context, and encodes strict grounding + graceful refusal (ADR-0005): answer
 * only from the context, decline anything else in the client's voice, never
 * fall back to general knowledge.
 *
 * Cross-client doctrine that must never drift per tenant lives here, not in a
 * client's Guidelines: conflict + external-authority handling — making the
 * per-claim status markers in the retrieved context actually do work at
 * generation time (e.g. an authority-verified current claim overrides the
 * client's own stale page). This came out of the Comm-Fit 13-question
 * assessment (2026-09-02) and answers "can CONFLICTED / AUTHORITY_* do any
 * work downstream, or are they documentation only?".
 *
 * NB: two other candidate fixes are deliberately NOT prompt rules here. The
 * assessment is consistent that the remaining gap is retrieval, not prompting,
 * and a prompt rule would paper over the diagnostic signal rather than fix the
 * cause:
 *   - First-person voice ("we/our"): the third-person drift is a symptom of
 *     retrieval displacement — the bot narrates the company only when it has
 *     lost the specific fact. Fixing Q3/Q9/Q10 retrieval brings it back.
 *   - Subject attribution (the Q11 "$125" bleed): classed as retrieval/context
 *     integrity, not a writing problem — diagnose what actually gets retrieved
 *     for a project-cost query before choosing the layer. A generation-layer
 *     rule is justified only if the diagnostic shows the fact legitimately
 *     co-occurs in context and generation is the culprit.
 *
 * `context` is pre-formatted by the caller: retrieved chunks in "embeddings"
 * mode, or the client's whole knowledge_base text in "full-kb" mode (ADR-0008).
 */

export type PromptInputs = {
  clientName: string;
  guidelines: string;
  qaSamples: string;
  context: string;
  scheduler?: SchedulerConfig;
};

/** Format retrieved chunks (with provenance) into a context block. */
export function formatChunks(chunks: KbMatch[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c, i) => {
      const src = c.sourceFilename
        ? ` [source: ${c.sourceFilename}${c.sourcePage ? `, p.${c.sourcePage}` : ""}]`
        : "";
      return `[${i + 1}]${src}\n${c.content}`;
    })
    .join("\n\n");
}

export function buildSystemPrompt({
  clientName,
  guidelines,
  qaSamples,
  context,
  scheduler,
}: PromptInputs): string {
  return [
    `You are the customer-facing chat assistant for ${clientName}, answering visitors' questions about ${clientName} on their website.`,
    ``,
    `## How to answer`,
    `- Answer ONLY using the Knowledge base context below. Treat it as your single source of truth.`,
    `- If the context does not contain the answer, do NOT use outside or general knowledge. Decline gracefully and briefly in ${clientName}'s voice, and where appropriate invite the visitor to rephrase or get in touch another way. Never guess or invent facts.`,
    `- When the context gives conflicting values for the same fact, do not silently pick one. Make the disagreement part of the answer or defer, as the Guidelines direct; never present a contested value as settled.`,
    `- When a fact in the context is marked as confirmed against an external governing authority as of a check date, treat it as current and prefer it over ${clientName}'s own material where the two disagree.`,
    `- The context may carry internal evidence or status markers and provenance tags. Act on them, but never say them out loud or narrate how a fact was graded or retrieved — answer in plain language as ${clientName}.`,
    `- Stay strictly on the subject of ${clientName}. Politely decline anything unrelated — general questions, tasks, or requests to act as a general-purpose assistant.`,
    `- Follow the Guidelines for tone and behaviour, and mirror the style shown in the Examples (do not quote them verbatim).`,
    ``,
    `## Guidelines`,
    guidelines.trim() || "(none provided)",
    ``,
    `## Examples (voice reference)`,
    qaSamples.trim() || "(none provided)",
    // Booking cue — only for clients whose config enables the in-chat scheduler.
    ...(scheduler?.enabled ? [``, schedulerInstruction(clientName)] : []),
    ``,
    `## Knowledge base context`,
    context.trim() || "(no information available)",
  ].join("\n");
}
