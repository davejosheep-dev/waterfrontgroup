import { NextRequest, NextResponse } from "next/server";
import { requireFloorAuth } from "@/lib/floor-api.server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireFloorAuth();
  if ("response" in auth) return auth.response;
  const venueId = request.nextUrl.searchParams.get("venueId");
  let query = auth.supabase.from("floor_plans").select("id,name,status,current_version_id,updated_at").order("updated_at", { ascending: false });
  if (venueId) query = query.eq("venue_id", venueId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Floor plans are temporarily unavailable.", code: "FLOOR_DATA_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ floorPlans: data ?? [] }, { headers: { "Cache-Control": "private, max-age=5" } });
}

