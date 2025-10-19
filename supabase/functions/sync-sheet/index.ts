// Deno Deploy / Supabase Edge Function: Sync Google Sheet -> public.orders
// Fetches the public GViz JSON for the shared sheet and upserts missing rows as available orders.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be configured as function secrets (set by Supabase).

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type GvizTable = {
  table: {
    cols: { id: string; label: string; type: string }[];
    rows: { c: { v: any; f?: string }[] }[];
  };
};

function parseGvizJsonp(input: string): GvizTable {
  const start = input.indexOf("setResponse(");
  const end = input.lastIndexOf(")");
  if (start === -1 || end === -1) throw new Error("Invalid GViz JSONP");
  const json = input.substring(start + "setResponse(".length, end);
  return JSON.parse(json);
}

function parseBudgetToNumber(budget: string | null | undefined): number {
  if (!budget) return 0;
  const cleaned = budget.replace(/[^0-9]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function mapTimelineToDueDate(timeline: string | null | undefined): string | null {
  if (!timeline) return null;
  const t = timeline.toLowerCase();
  if (t.includes("urgent") || t.includes("1-3")) return addDays(3);
  if (t.includes("week") || t.includes("3-7")) return addDays(7);
  if (t.includes("month") || t.includes("1-4")) return addDays(28);
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ error: "Missing Supabase env" }),
        { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Public GViz JSON endpoint for your sheet (first worksheet)
    const SHEET_GVIZ_URL =
      "https://docs.google.com/spreadsheets/d/1U3FZz4TCV3axNXy9U97xa9Zq85pCpTPZFNIy4Nfg7us/gviz/tq?tqx=out:json";

    const res = await fetch(SHEET_GVIZ_URL);
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    const text = await res.text();
    const gviz = parseGvizJsonp(text);

    const colIndex: Record<string, number> = {};
    gviz.table.cols.forEach((c, idx) => (colIndex[c.label] = idx));

    const required = [
      "What type of service you want ?",
      "Could you briefly describe your project or needs?",
      "What is your estimated budget for this project?",
      "What is your preferred timeline for project completion?",
      "What is your full name?",
      "Timestamp",
    ];
    for (const r of required) {
      if (!(r in colIndex)) throw new Error(`Missing column: ${r}`);
    }

    const rows = gviz.table.rows;

    const toInsert = rows.map((row, idx) => {
      const get = (label: string) => row.c[colIndex[label]]?.f ?? row.c[colIndex[label]]?.v ?? null;
      const fullName = String(get("What is your full name?") ?? "").trim() || "Client";
      const service = String(get("What type of service you want ?") ?? "").trim();
      const desc = String(get("Could you briefly describe your project or needs?") ?? "").trim();
      const budgetRaw = String(get("What is your estimated budget for this project?") ?? "").trim();
      const timeline = String(get("What is your preferred timeline for project completion?") ?? "").trim();
      const timestamp = String(get("Timestamp") ?? "").trim();

      const requirement_text = [service, desc].filter(Boolean).join(" — ");
      const price = parseBudgetToNumber(budgetRaw);
      const due_date = mapTimelineToDueDate(timeline);
      const sheet_row_id = timestamp || `row-${idx + 1}`;

      return {
        client_name: fullName,
        requirement_text,
        price,
        due_date,
        status: "available" as const,
        source: "google_sheet" as const,
        sheet_row_id,
        raw_sheet_json: row as unknown as Record<string, unknown>,
      };
    });

    // Fetch existing sheet_row_id to prevent duplicates
    const { data: existing, error: selErr } = await supabase
      .from("orders")
      .select("sheet_row_id");
    if (selErr) throw selErr;
    const existingSet = new Set((existing ?? []).map((r: any) => r.sheet_row_id).filter(Boolean));

    const newRecords = toInsert.filter((r) => !existingSet.has(r.sheet_row_id));

    let inserted = 0;
    if (newRecords.length > 0) {
      const { error: insErr } = await supabase.from("orders").insert(newRecords);
      if (insErr) throw insErr;
      inserted = newRecords.length;
    }

    return new Response(
      JSON.stringify({ ok: true, inserted, totalRows: rows.length }),
      { headers: { "content-type": "application/json", ...corsHeaders } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  }
});
