import { streamText, type ModelMessage } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { config } from "@/config";
import { dataForClient } from "@/lib/data";
import { embedQuery } from "@/lib/embedding";
import { buildSystemPrompt, formatChunks } from "@/lib/prompt";
import { propagateAttributes } from "@langfuse/tracing";
import {
  checkOrigin,
  corsHeaders,
  extractApiKey,
  resolveClientFromApiKey,
} from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Chat endpoint. Server-authoritative (ADR-0001), grounded (ADR-0005), and
 * authenticated by publishable API key + domain whitelist (ADR-0002).
 *
 * Flow: Bearer key → client (401) → domain whitelist (403) → resolve/mint
 * conversation → retrieve grounded context → stream Sonnet 4.6 → persist.
 */
export async function POST(req: Request) {
  const reqOrigin = req.headers.get("origin");

  const jsonError = (status: number, message: string, origin: string | null) =>
    Response.json({ error: message }, { status, headers: corsHeaders(origin) });

  // 1. Authenticate the client by API key.
  const key = extractApiKey(req);
  if (!key) return jsonError(401, "Missing API key", reqOrigin);
  const clientId = await resolveClientFromApiKey(key);
  if (!clientId) return jsonError(401, "Invalid API key", reqOrigin);

  const data = dataForClient(clientId);
  const client = await data.getClient();
  if (!client) return jsonError(401, "Invalid API key", reqOrigin);

  // 2. Domain whitelist. A disallowed origin gets no CORS grant (origin=null),
  //    so the browser blocks the response — the intended rejection.
  const origin = checkOrigin(req, client.allowedOrigins);
  if (!origin.ok) return jsonError(403, "Origin not allowed", null);

  // 3. Parse the request.
  let body: { conversationId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "Invalid JSON body", origin.origin);
  }
  const message = body.message?.trim();
  if (!message) return jsonError(400, "message is required", origin.origin);

  // 4. Resolve or mint the conversation (unguessable id — ADR-0001).
  let conversationId: string;
  const provided = body.conversationId?.trim();
  if (provided) {
    if (!(await data.conversationExists(provided))) {
      return jsonError(404, "Unknown conversation", origin.origin);
    }
    conversationId = provided;
  } else {
    conversationId = await data.createConversation();
  }

  // 5. History (server-owned) + grounded context for the new message.
  const history = await data.listMessages(conversationId);

  let context: string;
  if (config.retrieval.mode === "embeddings") {
    const queryEmbedding = await embedQuery(message);
    const chunks = await data.matchKbChunks(
      queryEmbedding,
      config.retrieval.topK,
      config.retrieval.similarityThreshold,
    );
    context = formatChunks(chunks);
  } else {
    // Interim full-KB mode (ADR-0008): the whole KB text, no embeddings.
    context = client.knowledgeBase;
  }

  const system = buildSystemPrompt({
    clientName: client.name,
    guidelines: client.guidelines,
    qaSamples: client.qaSamples,
    context,
  });

  const messages: ModelMessage[] = [
    ...history.map((m): ModelMessage => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  // 6. Persist the user message before generating — the server owns the record.
  await data.appendMessage(conversationId, "user", message);

  // Langfuse tracing (ADR-0006). `propagateAttributes` stamps trace-level
  // attributes onto the spans the @langfuse/vercel-ai-sdk integration creates.
  // Wrapping the streamText call is enough: the AI SDK opens its root span
  // synchronously here, so it inherits these before streaming continues.
  const result = propagateAttributes(
    {
      traceName: "chat",
      // One conversation = one Langfuse session, so every turn aggregates
      // together for per-session analysis (the ask).
      sessionId: conversationId,
      // Our tenant (client) is the billable/analytical unit — end-user sessions
      // are anonymous. Using userId for the client unlocks Langfuse's per-user
      // cost/usage/session dashboards per client. (If per-end-user identity is
      // added later, userId shifts to the end user; client stays in metadata/tags.)
      userId: clientId,
      tags: [`client:${client.name}`],
      metadata: { clientId, clientName: client.name },
    },
    () =>
      streamText({
        model: anthropic(config.chat.model),
        system,
        messages,
        telemetry: {
          isEnabled: true,
          functionId: "chat",
        },
        onFinish: async ({ text }) => {
          await data.appendMessage(conversationId, "assistant", text);
        },
      }),
  );

  return result.toTextStreamResponse({
    headers: { ...corsHeaders(origin.origin), "x-conversation-id": conversationId },
  });
}

/** CORS preflight. Reflect the requested origin; real enforcement is on POST. */
export function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
