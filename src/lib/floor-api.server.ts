import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { callFloorCommand, FloorServiceError } from "@/lib/floor-service.server";

export async function requireFloorAuth() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { response: NextResponse.json({ error: "Authentication required.", code: "UNAUTHENTICATED" }, { status: 401 }) } as const;
  return { supabase, user } as const;
}

export function readCommandId(request: Request, body: Record<string, unknown>) {
  const fromHeader = request.headers.get("idempotency-key")?.trim();
  const fromBody = typeof body.commandId === "string" ? body.commandId.trim() : typeof body.command_id === "string" ? body.command_id.trim() : "";
  return (fromHeader || fromBody || randomUUID()).slice(0, 160);
}

export function floorErrorResponse(error: unknown) {
  if (error instanceof FloorServiceError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "The floor operation could not be completed.", code: "FLOOR_COMMAND_FAILED" }, { status: 400 });
}

export async function executeFloorRpc(request: Request, rpcName: string, body: Record<string, unknown>, payload: Record<string, unknown>) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  try {
    const data = await callFloorCommand(auth.supabase, rpcName, { ...payload, command_id: readCommandId(request, body) });
    return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return floorErrorResponse(error);
  }
}

