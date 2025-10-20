import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DollarSign } from "lucide-react";

interface EditorRevenue {
  editor_id: string;
  editor_name: string;
  revenue: number;
  order_count: number;
}

const RevenueChart = () => {
  const [editorRevenues, setEditorRevenues] = useState<EditorRevenue[]>([]);
  const [threshold, setThreshold] = useState(30000);

  useEffect(() => {
    fetchRevenueData();
  }, []);

  const fetchRevenueData = async () => {
    // Get threshold from settings
    const { data: settings } = await supabase
      .from("admin_settings")
      .select("revenue_threshold_default")
      .single();

    if (settings) {
      setThreshold(Number(settings.revenue_threshold_default));
    }

    // Get all completed orders with editor info
    const { data: orders } = await supabase
      .from("orders")
      .select(`
        price,
        actual_amount,
        deliverable_link,
        taken_by,
        profiles!orders_taken_by_fkey (
          full_name
        )
      `)
      .eq("status", "completed")
      .neq("deliverable_link", "FAILED")
      .not("taken_by", "is", null);

    if (orders) {
      // Group by editor
      const revenueMap = new Map<string, EditorRevenue>();

      orders.forEach((order: any) => {
        const editorId = order.taken_by;
        const editorName = order.profiles?.full_name || "Unknown";
        const price = Number(order.actual_amount ?? order.price);

        if (revenueMap.has(editorId)) {
          const current = revenueMap.get(editorId)!;
          revenueMap.set(editorId, {
            ...current,
            revenue: current.revenue + price,
            order_count: current.order_count + 1,
          });
        } else {
          revenueMap.set(editorId, {
            editor_id: editorId,
            editor_name: editorName,
            revenue: price,
            order_count: 1,
          });
        }
      });

      setEditorRevenues(Array.from(revenueMap.values()));
    }
  };

  return (
    <Card className="glass-effect border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Revenue by Editor
        </CardTitle>
        <CardDescription>
          Monthly revenue progress toward ₹{threshold.toLocaleString()} threshold
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {editorRevenues.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No completed orders yet
          </p>
        ) : (
          editorRevenues.map((editor) => {
            const progress = (editor.revenue / threshold) * 100;
            const isOverThreshold = progress >= 100;

            return (
              <div key={editor.editor_id} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{editor.editor_name}</span>
                  <span className="text-muted-foreground">
                    {editor.order_count} order{editor.order_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Progress 
                    value={Math.min(progress, 100)} 
                    className="flex-1"
                  />
                  <span className={`text-sm font-semibold min-w-[120px] text-right ${
                    isOverThreshold ? "text-success" : "text-foreground"
                  }`}>
                    ₹{editor.revenue.toLocaleString()}
                  </span>
                </div>
                {isOverThreshold && (
                  <p className="text-xs text-success">
                    ✓ Threshold reached!
                  </p>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default RevenueChart;
