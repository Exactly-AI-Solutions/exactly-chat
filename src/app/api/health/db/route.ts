import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * DB health check: confirms the server can reach Supabase with the secret key,
 * that RLS bypass works, and that the schema is applied. Diagnostic only — this
 * cross-client count is not tenant data access and is not part of the seam.
 */
export async function GET() {
  try {
    const { error, count } = await db()
      .from("clients")
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ status: "ok", clients: count ?? 0 });
  } catch (e) {
    return NextResponse.json(
      { status: "error", message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
