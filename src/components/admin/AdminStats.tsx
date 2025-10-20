import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, CheckCircle2, Clock, DollarSign } from "lucide-react";

const AdminStats = () => {
  const [stats, setStats] = useState({
    totalOrders: 0,
    availableOrders: 0,
    completedOrders: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    // Total orders
    const { count: totalOrders } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    // Available orders
    const { count: availableOrders } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "available");

    // Completed orders
    const { count: completedOrders } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "completed");

    // Total revenue from completed orders (excluding failed)
    const { data: revenueData } = await supabase
      .from("orders")
      .select("price, actual_amount, deliverable_link")
      .eq("status", "completed")
      .neq("deliverable_link", "FAILED");

    const totalRevenue =
      revenueData?.reduce(
        (sum, order) => sum + Number((order as any).actual_amount ?? (order as any).price ?? 0),
        0
      ) || 0;

    setStats({
      totalOrders: totalOrders || 0,
      availableOrders: availableOrders || 0,
      completedOrders: completedOrders || 0,
      totalRevenue,
    });
  };

  const statCards = [
    {
      title: "Total Orders",
      value: stats.totalOrders,
      icon: Package,
      color: "text-primary",
    },
    {
      title: "Available",
      value: stats.availableOrders,
      icon: Clock,
      color: "text-warning",
    },
    {
      title: "Completed",
      value: stats.completedOrders,
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      title: "Total Revenue",
      value: `₹${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: "text-accent",
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, idx) => (
        <Card
          key={stat.title}
          className="glass-effect border-border/50 hover:border-primary/30 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground tracking-wide">
              {stat.title}
            </CardTitle>
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminStats;
