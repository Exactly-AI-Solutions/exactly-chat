import { dataForClient } from "@/lib/data";
import {
  checkOrigin,
  corsHeaders,
  extractApiKey,
  resolveClientFromApiKey,
} from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Widget bootstrap config: the client's name + opening bubbles + chips. Same
 * auth + domain whitelist as the chat endpoint (ADR-0002). The widget calls
 * this once on load to render the opening.
 */
export async function GET(req: Request) {
  const reqOrigin = req.headers.get("origin");
  const jsonError = (status: number, message: string, origin: string | null) =>
    Response.json({ error: message }, { status, headers: corsHeaders(origin) });

  const key = extractApiKey(req);
  if (!key) return jsonError(401, "Missing API key", reqOrigin);
  const clientId = await resolveClientFromApiKey(key);
  if (!clientId) return jsonError(401, "Invalid API key", reqOrigin);

  const data = dataForClient(clientId);
  const client = await data.getClient();
  if (!client) return jsonError(401, "Invalid API key", reqOrigin);

  const origin = checkOrigin(req, client.allowedOrigins);
  if (!origin.ok) return jsonError(403, "Origin not allowed", null);

  const widget = await data.getWidgetConfig();
  return Response.json(
    {
      name: client.name,
      openingBubbles: widget.openingBubbles,
      chips: widget.chips,
    },
    { headers: corsHeaders(origin.origin) },
  );
}

export function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}
