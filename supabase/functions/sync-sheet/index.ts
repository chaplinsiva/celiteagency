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
  let s = String(budget).toLowerCase().trim();
  // normalize dashes and delimiters
  s = s.replace(/[–—−]/g, "-");
  // regex to capture numbers with optional thousand separators/decimals and optional suffix
  const re = /(\d{1,3}(?:[,\s]\d{2,3})+|\d+(?:\.\d+)?)\s*(k|m|l|lac|lakh|lakhs|cr|crore)?/g;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    let numStr = m[1];
    const suffix = m[2] || "";
    // remove commas/spaces in digit groups
    numStr = numStr.replace(/[\s,]/g, "");
    let val = parseFloat(numStr);
    if (!isFinite(val)) continue;
    const suf = suffix.toLowerCase();
    if (suf === "k") val *= 1_000;
    else if (suf === "m") val *= 1_000_000;
    else if (suf === "l" || suf === "lac" || suf === "lakh" || suf === "lakhs") val *= 100_000;
    else if (suf === "cr" || suf === "crore") val *= 10_000_000;
    values.push(Math.round(val));
  }
  if (values.length === 0) return 0;
  // If a range like 1500 - 2500 is present, pick the higher bound
  return Math.max(...values);
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

function djb2Hash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(36);
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

    // Optional body to enable purge operation and override sheet URL
    let purge = false;
    let sheetUrlOverride: string | null = null;
    try {
      const body = await req.json();
      purge = Boolean(body?.purge);
      if (typeof body?.sheetUrl === "string" && body.sheetUrl.length > 0) {
        sheetUrlOverride = body.sheetUrl as string;
      }
    } catch (_) {
      // ignore parse error; treat as no body
    }

    // Determine source URL: OpenSheet (if provided) or fallback to GViz JSON with cache-busting
    const nowBust = Date.now();
    const defaultGviz = `https://docs.google.com/spreadsheets/d/1U3FZz4TCV3axNXy9U97xa9Zq85pCpTPZFNIy4Nfg7us/gviz/tq?tqx=out:json&cacheBust=${nowBust}`;
    const targetUrl = sheetUrlOverride
      ? (sheetUrlOverride.includes("?") ? `${sheetUrlOverride}&cacheBust=${nowBust}` : `${sheetUrlOverride}?cacheBust=${nowBust}`)
      : defaultGviz;

    const res = await fetch(targetUrl, {
      headers: { "cache-control": "no-cache" },
    });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
    let toInsert: any[] = [];
    let rowsLength = 0;
    if (targetUrl.includes("opensheet.elk.sh")) {
      // OpenSheet: JSON array of row objects keyed by header names
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error("OpenSheet response not an array");
      rowsLength = json.length;
      toInsert = json.map((row: Record<string, any>, idx: number) => {
        const get = (label: string) => row[label] ?? null;
        const fullName = String(get("What is your full name?") ?? get("Full Name") ?? "").trim() || "Client";
        const service = String(get("What type of service you want ?") ?? get("Service") ?? "").trim();
        const desc = String(get("Could you briefly describe your project or needs?") ?? get("Description") ?? "").trim();
        const budgetRaw = String(get("What is your estimated budget for this project?") ?? get("Budget") ?? "").trim();
        const timeline = String(get("What is your preferred timeline for project completion?") ?? get("Timeline") ?? "").trim();
        const timestamp = String(get("Timestamp") ?? get("timestamp") ?? "").trim();

        const requirement_text = [service, desc].filter(Boolean).join(" — ");
        const price = parseBudgetToNumber(budgetRaw);
        const due_date = mapTimelineToDueDate(timeline);
        // Deterministic fallback if timestamp is missing/duplicate
        const fingerprint = `${fullName}|${service}|${desc}|${budgetRaw}|${timeline}`;
        const sheet_row_id = timestamp || djb2Hash(fingerprint);

        // Skip empty rows (no meaningful content)
        if (!service && !desc) return null;

        return {
          client_name: fullName,
          requirement_text,
          price,
          due_date,
          status: "available" as const,
          source: "google_sheet" as const,
          sheet_row_id,
          raw_sheet_json: row as Record<string, unknown>,
        };
      }).filter(Boolean) as any[];
    } else {
      // GViz path as fallback
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
      rowsLength = rows.length;
      toInsert = rows.map((row, idx) => {
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
        const fingerprint = `${fullName}|${service}|${desc}|${budgetRaw}|${timeline}`;
        const sheet_row_id = timestamp || djb2Hash(fingerprint);

        if (!service && !desc) return null;

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
      }).filter(Boolean) as any[];
    }

    // Fetch existing orders keyed by sheet_row_id to prevent duplicates and enable updates
    const { data: existing, error: selErr } = await supabase
      .from("orders")
      .select("sheet_row_id, status, taken_by");
    if (selErr) throw selErr;
    const existingMap = new Map<string, { status: string | null; taken_by: string | null }>();
    for (const r of existing ?? []) {
      const id = (r as any).sheet_row_id as string | null;
      if (id) existingMap.set(id, { status: (r as any).status ?? null, taken_by: (r as any).taken_by ?? null });
    }

    const newRecords = toInsert.filter((r) => !existingMap.has(r.sheet_row_id));
    const updateRecords = toInsert.filter((r) => existingMap.has(r.sheet_row_id));

    let inserted = 0;
    if (newRecords.length > 0) {
      const { error: insErr } = await supabase.from("orders").insert(newRecords);
      if (insErr) throw insErr;
      inserted = newRecords.length;
    }

    // Update existing rows: only update editable fields, preserve status/taken_by
    let updated = 0;
    for (const r of updateRecords) {
      const { error: upErr } = await supabase
        .from("orders")
        .update({
          client_name: r.client_name,
          requirement_text: r.requirement_text,
          price: r.price,
          due_date: r.due_date,
          raw_sheet_json: r.raw_sheet_json,
          source: "google_sheet",
          updated_at: new Date().toISOString(),
        })
        .eq("sheet_row_id", r.sheet_row_id);
      if (upErr) throw upErr;
      updated += 1;
    }

    let purged = 0;
    if (purge) {
      // 1) Remove any non-sheet orders entirely
      const { count: nonSheetCount, error: delErr1 } = await supabase
        .from("orders")
        .delete({ count: "exact" })
        .neq("source", "google_sheet");
      if (delErr1) throw delErr1;
      purged += nonSheetCount ?? 0;

      // 2) Reconcile sheet orders: delete rows that no longer exist in the sheet
      const currentIds = new Set(toInsert.map((r) => r.sheet_row_id));
      const staleIds: string[] = [];
      for (const [id] of existingMap) {
        if (!currentIds.has(id)) staleIds.push(id);
      }
      if (staleIds.length > 0) {
        const chunk = 1000; // safety for IN clause limits
        for (let i = 0; i < staleIds.length; i += chunk) {
          const slice = staleIds.slice(i, i + chunk);
          const { count: sheetDelCount, error: delErr2 } = await supabase
            .from("orders")
            .delete({ count: "exact" })
            .in("sheet_row_id", slice);
          if (delErr2) throw delErr2;
          purged += sheetDelCount ?? 0;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, inserted, updated, purged, totalRows: rowsLength }),
      { headers: { "content-type": "application/json", ...corsHeaders } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { "content-type": "application/json", ...corsHeaders } },
    );
  }
});
