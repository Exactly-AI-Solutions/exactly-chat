import "server-only";
import { db } from "./supabase";

/**
 * The tenant-scoped data-access seam (ADR-0004).
 *
 * This is the ONLY sanctioned path to read or write tenant-owned data. Every
 * method here injects the bound client's id, so nothing in this module can
 * touch another client's rows — the "you can't forget the filter" guarantee is
 * by construction, not by discipline. Obtain an instance via `dataForClient`;
 * never query `clients` / `conversations` / `messages` / `kb_chunks` directly
 * elsewhere.
 *
 * Resolving *which* client a request belongs to (API-key lookup) is a
 * deliberately cross-client operation and lives in the auth module (Phase 5),
 * not here — by the time you have a `ClientData`, the tenant is already known.
 */

export type ClientConfig = {
  id: string;
  name: string;
  allowedOrigins: string[];
  guidelines: string;
  qaSamples: string;
  knowledgeBase: string;
};

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type KbMatch = {
  id: string;
  content: string;
  sourceFilename: string | null;
  sourcePage: number | null;
  similarity: number;
};

export type WidgetConfig = {
  openingBubbles: string[];
  chips: string[];
};

export class ClientData {
  constructor(private readonly clientId: string) {}

  /** The client's config: Domain Whitelist + wholesale prompt content. */
  async getClient(): Promise<ClientConfig | null> {
    const { data, error } = await db()
      .from("clients")
      .select("id, name, allowed_origins, guidelines, qa_samples, knowledge_base")
      .eq("id", this.clientId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      allowedOrigins: data.allowed_origins ?? [],
      guidelines: data.guidelines ?? "",
      qaSamples: data.qa_samples ?? "",
      knowledgeBase: data.knowledge_base ?? "",
    };
  }

  /**
   * The client's widget opening config (bubbles + chips). Degrades to empty if
   * the widget_config column isn't present yet (pre-migration 0004), so the
   * demo still works without an opening.
   */
  async getWidgetConfig(): Promise<WidgetConfig> {
    const { data, error } = await db()
      .from("clients")
      .select("widget_config")
      .eq("id", this.clientId)
      .maybeSingle();
    if (error) return { openingBubbles: [], chips: [] };
    const cfg = (data?.widget_config ?? {}) as Partial<WidgetConfig>;
    return {
      openingBubbles: Array.isArray(cfg.openingBubbles) ? cfg.openingBubbles : [],
      chips: Array.isArray(cfg.chips) ? cfg.chips : [],
    };
  }

  /** Mint a new conversation for this client; returns its unguessable id. */
  async createConversation(): Promise<string> {
    const { data, error } = await db()
      .from("conversations")
      .insert({ client_id: this.clientId })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  /** True only if the conversation exists AND belongs to this client. */
  async conversationExists(conversationId: string): Promise<boolean> {
    const { data, error } = await db()
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("client_id", this.clientId)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  /** Full message history for a conversation, oldest first. */
  async listMessages(conversationId: string): Promise<ConversationMessage[]> {
    const { data, error } = await db()
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .eq("client_id", this.clientId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ConversationMessage[];
  }

  /** Append one message and bump the conversation's freshness. */
  async appendMessage(
    conversationId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const insert = await db().from("messages").insert({
      conversation_id: conversationId,
      client_id: this.clientId,
      role,
      content,
    });
    if (insert.error) throw insert.error;

    const touch = await db()
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("client_id", this.clientId);
    if (touch.error) throw touch.error;
  }

  /** Tenant-scoped similarity search over this client's Knowledge Base. */
  async matchKbChunks(
    queryEmbedding: number[],
    matchCount: number,
    similarityThreshold: number,
  ): Promise<KbMatch[]> {
    const { data, error } = await db().rpc("match_kb_chunks", {
      p_client_id: this.clientId,
      p_query_embedding: queryEmbedding,
      p_match_count: matchCount,
      p_similarity_threshold: similarityThreshold,
    });
    if (error) throw error;
    type Row = {
      id: string;
      content: string;
      source_filename: string | null;
      source_page: number | null;
      similarity: number;
    };
    return ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      content: r.content,
      sourceFilename: r.source_filename,
      sourcePage: r.source_page,
      similarity: r.similarity,
    }));
  }
}

export function dataForClient(clientId: string): ClientData {
  return new ClientData(clientId);
}
