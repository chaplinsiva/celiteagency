import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, DollarSign, Loader2, Package, CheckCircle2, LogOut, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Order {
  id: string;
  client_name: string;
  requirement_text: string;
  price: number;
  due_date: string | null;
  status: string;
  taken_at: string | null;
  completed_at: string | null;
  deliverable_link: string | null;
  created_at: string;
}

interface MyOrdersListProps {
  userId: string;
}

const MyOrdersList = ({ userId }: MyOrdersListProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingOrder, setCompletingOrder] = useState<string | null>(null);
  const [leavingOrder, setLeavingOrder] = useState<string | null>(null);
  const [failingOrder, setFailingOrder] = useState<string | null>(null);
  const [deliverableLinks, setDeliverableLinks] = useState<Record<string, string>>({});
  const [actualAmounts, setActualAmounts] = useState<Record<string, string>>({});
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchOrders();
    subscribeToOrders();
  }, [userId]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("taken_by", userId)
      .order("taken_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch your orders");
      console.error(error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const subscribeToOrders = () => {
    const channel = supabase
      .channel("my-orders-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `taken_by=eq.${userId}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCompleteOrder = async (orderId: string) => {
    setCompletingOrder(orderId);

    const deliverableLink = deliverableLinks[orderId];
    const actualAmountRaw = actualAmounts[orderId];
    const feedback = feedbacks[orderId];
    const actualAmount = actualAmountRaw ? Number(actualAmountRaw) : null;

    const { error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        deliverable_link: deliverableLink || null,
        actual_amount: actualAmount,
        editor_feedback: feedback || null,
      })
      .eq("id", orderId)
      .eq("taken_by", userId);

    if (error) {
      toast.error("Failed to complete order");
      console.error(error);
    } else {
      // Create assignment audit log
      await supabase.from("assignments").insert({
        order_id: orderId,
        user_id: userId,
        action: "completed",
      });

      toast.success("Order marked as completed!");
      setDeliverableLinks((prev) => {
        const updated = { ...prev };
        delete updated[orderId];
        return updated;
      });
      setActualAmounts((prev) => {
        const updated = { ...prev };
        delete updated[orderId];
        return updated;
      });
      setFeedbacks((prev) => {
        const updated = { ...prev };
        delete updated[orderId];
        return updated;
      });
    }

    setCompletingOrder(null);
  };

  const handleLeaveOrder = async (orderId: string) => {
    setLeavingOrder(orderId);
    const { error } = await supabase
      .from("orders")
      .update({
        status: "available",
        taken_by: null,
        taken_at: null,
      })
      .eq("id", orderId)
      .eq("taken_by", userId);

    if (error) {
      toast.error("Failed to leave order");
      console.error(error);
    } else {
      toast.success("Order released back to available");
    }
    setLeavingOrder(null);
  };

  const handleFailOrder = async (orderId: string) => {
    setFailingOrder(orderId);
    const { error } = await supabase
      .from("orders")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        deliverable_link: "FAILED",
      })
      .eq("id", orderId)
      .eq("taken_by", userId);

    if (error) {
      toast.error("Failed to mark order as failed");
      console.error(error);
    } else {
      toast.success("Order marked as failed");
    }
    setFailingOrder(null);
  };

  const takenOrders = orders.filter((order) => order.status === "taken");
  const completedOrders = orders.filter(
    (order) => order.status === "completed" && order.deliverable_link !== "FAILED"
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const OrderCard = ({ order, showComplete = false }: { order: Order; showComplete?: boolean }) => (
    <Card className="glass-effect border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl">{order.client_name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Taken {formatDistanceToNow(new Date(order.taken_at!), { addSuffix: true })}
            </p>
          </div>
          <Badge
            variant="secondary"
            className={
              order.status === "completed"
                ? "bg-success/10 text-success border-success/20"
                : "bg-warning/10 text-warning border-warning/20"
            }
          >
            {order.status === "completed" ? "Completed" : "In Progress"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{order.requirement_text}</p>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center text-primary">
            <DollarSign className="h-4 w-4 mr-1" />
            <span className="font-semibold">₹{order.price.toLocaleString()}</span>
          </div>
          {order.due_date && (
            <div className="flex items-center text-muted-foreground">
              <Calendar className="h-4 w-4 mr-1" />
              <span>{new Date(order.due_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {showComplete && (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="space-y-2">
              <Label htmlFor={`deliverable-${order.id}`} className="text-sm">
                Deliverable Link (Optional)
              </Label>
              <Input
                id={`deliverable-${order.id}`}
                type="url"
                placeholder="https://drive.google.com/..."
                value={deliverableLinks[order.id] || ""}
                onChange={(e) =>
                  setDeliverableLinks((prev) => ({
                    ...prev,
                    [order.id]: e.target.value,
                  }))
                }
                className="bg-input border-border"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor={`amount-${order.id}`} className="text-sm">
                  Actual Amount Received (₹)
                </Label>
                <Input
                  id={`amount-${order.id}`}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 900"
                  value={actualAmounts[order.id] || ""}
                  onChange={(e) =>
                    setActualAmounts((prev) => ({
                      ...prev,
                      [order.id]: e.target.value,
                    }))
                  }
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`feedback-${order.id}`} className="text-sm">
                  Feedback (Optional)
                </Label>
                <Input
                  id={`feedback-${order.id}`}
                  type="text"
                  placeholder="Client notes, issues, etc."
                  value={feedbacks[order.id] || ""}
                  onChange={(e) =>
                    setFeedbacks((prev) => ({
                      ...prev,
                      [order.id]: e.target.value,
                    }))
                  }
                  className="bg-input border-border"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Button
                className="w-full bg-success hover:bg-success/90 transition-all"
                onClick={() => handleCompleteOrder(order.id)}
                disabled={completingOrder === order.id}
              >
                {completingOrder === order.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Complete
                  </>
                )}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => handleLeaveOrder(order.id)}
                disabled={leavingOrder === order.id}
              >
                {leavingOrder === order.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 h-4 w-4" />
                    Leave it
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => handleFailOrder(order.id)}
                disabled={failingOrder === order.id}
              >
                {failingOrder === order.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Failing...
                  </>
                ) : (
                  <>
                    <XCircle className="mr-2 h-4 w-4" />
                    Failed
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {order.status === "completed" && order.deliverable_link && (
          <div className="pt-2 border-t border-border">
            <Label className="text-sm text-muted-foreground">Deliverable:</Label>
            <a
              href={order.deliverable_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline break-all"
            >
              {order.deliverable_link}
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Tabs defaultValue="taken" className="w-full">
      <TabsList className="grid w-full max-w-md grid-cols-2 bg-muted/50">
        <TabsTrigger value="taken">
          In Progress ({takenOrders.length})
        </TabsTrigger>
        <TabsTrigger value="completed">
          Completed ({completedOrders.length})
        </TabsTrigger>
      </TabsList>
      <div className="flex justify-end mt-4">
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <TabsContent value="taken" className="mt-6">
        {takenOrders.length === 0 ? (
          <Card className="glass-effect border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                You don't have any orders in progress
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {takenOrders.map((order) => (
              <OrderCard key={order.id} order={order} showComplete />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="completed" className="mt-6">
        {completedOrders.length === 0 ? (
          <Card className="glass-effect border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                You haven't completed any orders yet
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {completedOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default MyOrdersList;
