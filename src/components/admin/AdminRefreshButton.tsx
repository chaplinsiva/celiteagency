import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function AdminRefreshButton() {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      // Prefer direct fetch to the Functions endpoint to avoid invoke transport issues
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-sheet`;
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      const sheetExportUrl = `https://docs.google.com/spreadsheets/d/1U3FZz4TCV3axNXy9U97xa9Zq85pCpTPZFNIy4Nfg7us/gviz/tq?tqx=out:json&gid=2062186565&cacheBust=${Date.now()}`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          sheetUrl: sheetExportUrl,
          user: "celite",
          purge: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      toast.success(
        `Refreshed${json?.inserted != null ? `, inserted ${json.inserted}` : ""}`
      );
    } catch (e: any) {
      toast.error(`Refresh failed: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleRefresh} disabled={loading} className="gap-2">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {loading ? "Refreshing..." : "Refresh from Sheet"}
    </Button>
  );
}
