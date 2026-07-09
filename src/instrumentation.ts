import { registerOTel } from "@vercel/otel";
import { registerTelemetry } from "ai";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";

/**
 * OpenTelemetry → Langfuse tracing (ADR-0006: Langfuse for tracing, NOT prompt
 * management). Next.js auto-loads `register()` once per runtime.
 *
 * AI SDK v7 emits telemetry through its own registry, and Langfuse maps those
 * spans via the dedicated `@langfuse/vercel-ai-sdk` integration + the OTel-native
 * `LangfuseSpanProcessor` (`@langfuse/otel`). The older `langfuse-vercel`
 * `LangfuseExporter` predates the v7 span format and silently drops the spans.
 *
 * We register the span processor through `@vercel/otel` (not a bare NodeSDK) so
 * Vercel's request-draining flush covers it — no manual `forceFlush` per request.
 *
 * Config is passed explicitly: our env var is LANGFUSE_BASE_URL, which matches
 * the SDK's expected name, but passing it keeps the wiring self-evident.
 */
export function register() {
  // Node-only: the AI chat route runs on the Node.js runtime, and the OTel
  // node exporter has no business initializing in the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  registerOTel({
    serviceName: "exactly-chat",
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL,
      }),
    ],
  });

  // Register the AI SDK v7 → Langfuse span mapping once at startup.
  registerTelemetry(new LangfuseVercelAiSdkIntegration());
}
