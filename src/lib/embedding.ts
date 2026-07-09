import "server-only";
import { embed } from "ai";
import { openai } from "@ai-sdk/openai";
import { config } from "@/config";

/**
 * Embed a single query for similarity search. MUST use the same model as
 * ingestion (ADR-0003) — `config.embedding.model` is the single source of truth.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.textEmbeddingModel(config.embedding.model),
    value: text,
  });
  return embedding;
}
