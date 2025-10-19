import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users } from "lucide-react";

interface EditorStats {
  id: string;
  name: string;
  email: string;
  total_orders: number;
  completed_orders: number;
  in_progress: number;
  total_revenue: number;
}

const EditorPerformance = () => {
  const [editors, setEditors] = useState<EditorStats[]>([]);

  useEffect(() => {
    fetchEditorPerformance();
  }, []);

  const fetchEditorPerformance = async () => {
    // Get all editors
    const { data: editorRoles } = await supabase
      .from("user_roles")
      .select(`
        user_id,
        profiles!user_roles_user_id_fkey (
          full_name,
          email
        )
      `)
      .eq("role", "editor");

    if (!editorRoles) return;

    const editorStats: EditorStats[] = [];

    for (const editor of editorRoles) {
      const userId = editor.user_id;
      const profile = (editor as any).profiles;

      // Get order counts
      const { count: totalOrders } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("taken_by", userId);

      const { count: completedOrders } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("taken_by", userId)
        .eq("status", "completed");

      const { count: inProgress } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("taken_by", userId)
        .eq("status", "taken");

      // Get total revenue
      const { data: revenueData } = await supabase
        .from("orders")
        .select("price")
        .eq("taken_by", userId)
        .eq("status", "completed");

      const totalRevenue = revenueData?.reduce((sum, order) => sum + Number(order.price), 0) || 0;

      editorStats.push({
        id: userId,
        name: profile?.full_name || "Unknown",
        email: profile?.email || "",
        total_orders: totalOrders || 0,
        completed_orders: completedOrders || 0,
        in_progress: inProgress || 0,
        total_revenue: totalRevenue,
      });
    }

    setEditors(editorStats);
  };

  return (
    <Card className="glass-effect border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Editor Performance
        </CardTitle>
      </CardHeader>
      <CardContent>
        {editors.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No editors found
          </p>
        ) : (
          <div className="space-y-4">
            {editors.map((editor) => (
              <div
                key={editor.id}
                className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {editor.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className="font-semibold">{editor.name}</h4>
                    <p className="text-sm text-muted-foreground">{editor.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{editor.total_orders}</p>
                    <p className="text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-warning">{editor.in_progress}</p>
                    <p className="text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-success">{editor.completed_orders}</p>
                    <p className="text-muted-foreground">Done</p>
                  </div>
                  <div className="text-center min-w-[100px]">
                    <p className="text-lg font-bold text-accent">
                      ₹{editor.total_revenue.toLocaleString()}
                    </p>
                    <p className="text-muted-foreground">Revenue</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EditorPerformance;
