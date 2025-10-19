import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2, Shield } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import AdminStats from "@/components/admin/AdminStats";
import RevenueChart from "@/components/admin/RevenueChart";
import EditorPerformance from "@/components/admin/EditorPerformance";
import MonthlyRevenueBar from "@/components/admin/MonthlyRevenueBar";
import EditorsOverview from "@/components/admin/EditorsOverview";
import DetailedOrdersTable from "@/components/admin/DetailedOrdersTable";
import CategoryPieChart from "@/components/admin/CategoryPieChart";
import AdminRefreshButton from "@/components/admin/AdminRefreshButton";
import { Card, CardContent } from "@/components/ui/card";

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAccess();
  }, [navigate]);

  const checkAdminAccess = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth");
      return;
    }

    setUser(session.user);

    // Check if user has admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleData) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <DashboardLayout>
        <Card className="glass-effect border-destructive/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center">
              You don't have admin permissions to access this page.
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-10">
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h1 className="text-4xl font-bold tracking-tight gradient-text">Admin Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Monitor team performance, revenue, and order management
          </p>
          <div className="mt-4">
            <AdminRefreshButton />
          </div>
        </div>

        <div className="space-y-8 animate-in fade-in duration-300">
          <MonthlyRevenueBar />
          <AdminStats />
          <RevenueChart />
          <CategoryPieChart />
          <DetailedOrdersTable />
          <EditorsOverview />
          <EditorPerformance />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Admin;
