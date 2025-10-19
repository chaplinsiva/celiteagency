import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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

export default function SheetSyncButton() {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    try {
      setLoading(true);
      const url =
        "https://docs.google.com/spreadsheets/d/1U3FZz4TCV3axNXy9U97xa9Zq85pCpTPZFNIy4Nfg7us/gviz/tq?tqx=out:json";
      const res = await fetch(url);
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
        const desc = String(
          get("Could you briefly describe your project or needs?") ?? ""
        ).trim();
        const budgetRaw = String(
          get("What is your estimated budget for this project?") ?? ""
        ).trim();
        const timeline = String(
          get("What is your preferred timeline for project completion?") ?? ""
        ).trim();
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
          raw_sheet_json: row as any,
        };
      });

      const { data: existing, error: selErr } = await supabase
        .from("orders")
        .select("sheet_row_id");
      if (selErr) throw selErr;
      const existingSet = new Set((existing ?? []).map((r: any) => r.sheet_row_id).filter(Boolean));

      const newRecords = toInsert.filter((r) => !existingSet.has(r.sheet_row_id));
      if (newRecords.length === 0) {
        toast.info("No new orders to sync");
        setLoading(false);
        return;
      }

      const { error: insErr } = await supabase.from("orders").insert(newRecords);
      if (insErr) throw insErr;

      toast.success(`Synced ${newRecords.length} new order(s)`);
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSync} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {loading ? "Syncing..." : "Sync from Google Sheet"}
    </Button>
  );
}
