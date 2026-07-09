import type { KbMatch } from "./data";

/**
 * The global prompt scaffold (ADR-0006 — lives in code, not Langfuse). Wraps the
 * per-client wholesale content (Guidelines, QA Samples) and the Knowledge base
 * context, and encodes strict grounding + graceful refusal (ADR-0005): answer
 * only from the context, decline anything else in the client's voice, never
 * fall back to general knowledge.
 *
 * `context` is pre-formatted by the caller: retrieved chunks in "embeddings"
 * mode, or the client's whole knowledge_base text in "full-kb" mode (ADR-0008).
 */

export type PromptInputs = {
  clientName: string;
  guidelines: string;
  qaSamples: string;
  context: string;
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
}: PromptInputs): string {
  return [
    `You are the customer-facing chat assistant for ${clientName}, answering visitors' questions about ${clientName} on their website.`,
    ``,
    `## How to answer`,
    `- Answer ONLY using the Knowledge base context below. Treat it as your single source of truth.`,
    `- If the context does not contain the answer, do NOT use outside or general knowledge. Decline gracefully and briefly in ${clientName}'s voice, and where appropriate invite the visitor to rephrase or get in touch another way. Never guess or invent facts.`,
    `- Stay strictly on the subject of ${clientName}. Politely decline anything unrelated — general questions, tasks, or requests to act as a general-purpose assistant.`,
    `- Follow the Guidelines for tone and behaviour, and mirror the style shown in the Examples (do not quote them verbatim).`,
    ``,
    `## Guidelines`,
    guidelines.trim() || "(none provided)",
    ``,
    `## Examples (voice reference)`,
    qaSamples.trim() || "(none provided)",
    ``,
    `## Knowledge base context`,
    context.trim() || "(no information available)",
  ].join("\n");
}
