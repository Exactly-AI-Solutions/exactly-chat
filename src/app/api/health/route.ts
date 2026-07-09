import { NextResponse } from "next/server";
import { env } from "@/config";

export const runtime = "nodejs";

/**
 * Health check: confirms the app is running and reports which external-service
 * env vars are wired (presence only — never values). Phase 0 "done when".
 */
export function GET() {
  const present = (v?: string) => Boolean(v && v.length > 0);

  return NextResponse.json({
    status: "ok",
    env: {
      anthropic: present(env.anthropicApiKey),
      openai: present(env.openaiApiKey),
      supabaseUrl: present(env.supabaseUrl),
      supabasePublishableKey: present(env.supabasePublishableKey),
      supabaseSecretKey: present(env.supabaseSecretKey),
      langfuseSecret: present(env.langfuseSecretKey),
      langfusePublic: present(env.langfusePublicKey),
      langfuseBaseUrl: present(env.langfuseBaseUrl),
    },
  });
}
