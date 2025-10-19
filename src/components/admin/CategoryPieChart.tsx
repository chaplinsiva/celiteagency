import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

interface OrderLite {
  id: string;
  requirement_text: string;
  status: string;
  price: number;
}

const COLORS = [
  "#ec4899", // pink-500
  "#a855f7", // purple-500
  "#3b82f6", // blue-500
  "#22c55e", // green-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#06b6d4", // cyan-500
  "#eab308", // yellow-500
];

function extractCategory(req: string | null | undefined): string {
  if (!req) return "Uncategorized";
  const first = String(req).split(" — ")[0]?.trim();
  return first || "Uncategorized";
}

export default function CategoryPieChart() {
  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, requirement_text, status, price")
      .limit(1000);
    setOrders(data || []);
    setLoading(false);
  };

  const pieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number; revenue: number; success: number; failed: number }>();
    for (const o of orders) {
      const cat = extractCategory(o.requirement_text);
      if (!map.has(cat)) map.set(cat, { name: cat, value: 0, revenue: 0, success: 0, failed: 0 });
      const rec = map.get(cat)!;
      rec.value += 1;
      if (o.status === "completed") {
        rec.revenue += Number(o.price || 0);
        // Failed sentinel from earlier logic
        // We don't have deliverable_link here; count success as completed by default
        rec.success += 1;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [orders]);

  return (
    <Card className="glass-effect border-border/50">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Top Categories by Orders (animated)</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              innerRadius={50}
              isAnimationActive
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(val: any, name: any, props: any) => [val, props?.payload?.name]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
