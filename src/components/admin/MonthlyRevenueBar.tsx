import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

export default function MonthlyRevenueBar() {
  const [threshold, setThreshold] = useState<number>(30000);
  const [revenue, setRevenue] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    // 1) Threshold from admin_settings (first row)
    const { data: settings } = await supabase.from("admin_settings").select("revenue_threshold_default").limit(1).maybeSingle();
    if (settings?.revenue_threshold_default) {
      setThreshold(Number(settings.revenue_threshold_default));
    }

    // 2) Current month revenue from completed orders
    const from = startOfMonth();
    const to = startOfNextMonth();
    const { data: completed } = await supabase
      .from("orders")
      .select("price, actual_amount, completed_at")
      .eq("status", "completed")
      .neq("deliverable_link", "FAILED")
      .gte("completed_at", from.toISOString())
      .lt("completed_at", to.toISOString());

    const total = (completed ?? []).reduce((sum, o: any) => sum + Number((o.actual_amount ?? o.price) || 0), 0);
    // Tiny delay to let CSS transition animate from 0 nicely
    requestAnimationFrame(() => setRevenue(total));
    setLoading(false);
  };

  const percent = useMemo(() => {
    if (threshold <= 0) return 0;
    return Math.min(100, Math.max(0, (revenue / threshold) * 100));
  }, [revenue, threshold]);

  return (
    <Card className="glass-effect border-border/50 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Monthly revenue progress toward ₹{threshold.toLocaleString()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">This month</span>
            <span className="font-semibold">₹{revenue.toLocaleString()}</span>
          </div>

          <div className="relative h-3 w-full rounded-full bg-input overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-blue-500 shadow-[0_0_20px_hsl(270_100%_60%_/_0.35)]"
              style={{
                width: loading ? 0 : `${percent}%`,
                transition: "width 1200ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{percent.toFixed(0)}%</span>
            <span>Goal: ₹{threshold.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
