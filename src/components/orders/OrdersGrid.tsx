import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Loader2, Package, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Order {
  id: string;
  client_name: string;
  requirement_text: string;
  price: number;
  due_date: string | null;
  status: string;
  taken_by: string | null;
  taken_at: string | null;
  created_at: string;
}

interface OrdersGridProps {
  userId: string;
}

const OrdersGrid = ({ userId }: OrdersGridProps) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [takingOrder, setTakingOrder] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    subscribeToOrders();
  }, []);

  const fetchOrders = async () => {
    if (!orders.length) setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "available")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to fetch orders");
      console.error(error);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      // Trigger server-side sync from Google Sheet, then refetch
      try {
        const sheetExportUrl = `https://docs.google.com/spreadsheets/d/1U3FZz4TCV3axNXy9U97xa9Zq85pCpTPZFNIy4Nfg7us/gviz/tq?tqx=out:json&gid=2062186565&cacheBust=${Date.now()}`;
        await supabase.functions.invoke("sync-sheet", {
          body: {
            sheetUrl: sheetExportUrl,
            user: "celite",
          },
        });
      } catch (e) {
        // Ignore function errors for editors; still try to refetch orders
        console.warn("sync-sheet invoke failed", e);
      }
      await fetchOrders();
    } finally {
      setRefreshing(false);
    }
  };

  const extractFromSheet = (order: any) => {
    const raw = order?.raw_sheet_json as any;
    // GViz row format: { c: [{v,f?}, ...] } with fixed columns we used
    const get = (idx: number) => {
      try {
        const cell = raw?.c?.[idx];
        return (cell?.f ?? cell?.v) ?? null;
      } catch {
        return null;
      }
    };
    // Column mapping from the sheet we integrated earlier
    const timestamp = get(0);
    const service = get(1);
    const description = get(2);
    const budget = get(3);
    const timeline = get(4);
    const fullName = get(5);
    const email = get(6);
    const phone = get(7);
    const whatsapp = get(8);
    return { timestamp, service, description, budget, timeline, fullName, email, phone, whatsapp };
  };

  const subscribeToOrders = () => {
    const channel = supabase
      .channel("orders-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
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

  const handleTakeOrder = async (orderId: string) => {
    setTakingOrder(orderId);

    const { error } = await supabase
      .from("orders")
      .update({
        status: "taken",
        taken_by: userId,
        taken_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", "available");

    if (error) {
      if (error.code === "PGRST116") {
        toast.error("This order has already been taken by someone else");
      } else {
        toast.error("Failed to take order");
        console.error(error);
      }
    } else {
      // Create assignment audit log
      await supabase.from("assignments").insert({
        order_id: orderId,
        user_id: userId,
        action: "taken",
      });

      toast.success("Order taken successfully!");
    }

    setTakingOrder(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="glass-effect border-border/50">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            No available orders at the moment. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleRefresh} disabled={refreshing} className="gap-2">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {orders.map((order) => (
          <Card
            key={order.id}
            className="glass-effect border-border/50 hover:border-primary/50 transition-all group"
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1">
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {order.client_name}
                  </CardTitle>
                  <CardDescription className="text-sm">
                    {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
                  Available
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-3">
                {order.requirement_text}
              </p>

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

              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="w-full bg-primary hover:bg-primary/90 transition-all"
                  onClick={() => handleTakeOrder(order.id)}
                  disabled={takingOrder === order.id}
                >
                  {takingOrder === order.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Taking...
                    </>
                  ) : (
                    "Take Order"
                  )}
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => setSelected(order)}
                    >
                      View Order
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Order Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 text-sm">
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-muted-foreground">Client</div>
                        <div className="col-span-2 font-medium">{selected?.client_name}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-muted-foreground">Requirement</div>
                        <div className="col-span-2">{selected?.requirement_text}</div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-muted-foreground">Price</div>
                        <div className="col-span-2 font-semibold">₹{selected?.price.toLocaleString()}</div>
                      </div>
                      {selected && (
                        (() => {
                          const s = extractFromSheet(selected as any);
                          return (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-muted-foreground">Email</div>
                                <div className="col-span-2 break-all">{s.email || "-"}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-muted-foreground">Phone</div>
                                <div className="col-span-2">{s.phone || "-"}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-muted-foreground">Service</div>
                                <div className="col-span-2">{s.service || "-"}</div>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="text-muted-foreground">Timeline</div>
                                <div className="col-span-2">{s.timeline || "-"}</div>
                              </div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default OrdersGrid;
