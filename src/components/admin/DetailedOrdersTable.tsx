import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface OrderRow {
  id: string;
  client_name: string;
  requirement_text: string;
  price: number;
  status: string;
  taken_by: string | null;
  created_at: string | null;
  completed_at: string | null;
  deliverable_link: string | null;
  raw_sheet_json?: any | null;
}

export default function DetailedOrdersTable() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<OrderRow | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from("orders")
      .select("id, client_name, requirement_text, price, status, taken_by, created_at, completed_at, deliverable_link, raw_sheet_json")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error(error);
      setOrders([]);
      setLoading(false);
      return;
    }

    setOrders(rows || []);

    // Fetch editor names for taken_by
    const ids = Array.from(new Set((rows || []).map(r => r.taken_by).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach(p => {
        map[p.id] = p.full_name || p.email;
      });
      setNames(map);
    }
    setLoading(false);
  };

  const rowsView = useMemo(() => {
    return orders.map(o => {
      const isFailed = o.status === "completed" && o.deliverable_link === "FAILED";
      const editor = o.taken_by ? (names[o.taken_by] || o.taken_by) : "-";
      return { ...o, isFailed, editor } as OrderRow & { isFailed: boolean; editor: string };
    });
  }, [orders, names]);

  const extractFromSheet = (row: OrderRow | null) => {
    const raw = (row as any)?.raw_sheet_json as any;
    const get = (idx: number) => {
      try {
        const cell = raw?.c?.[idx];
        return (cell?.f ?? cell?.v) ?? null;
      } catch { return null; }
    };
    return {
      timestamp: get(0),
      service: get(1),
      description: get(2),
      budget: get(3),
      timeline: get(4),
      fullName: get(5),
      email: get(6),
      phone: get(7),
      whatsapp: get(8),
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="glass-effect border-border/50 overflow-hidden">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">Detailed Orders (latest)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="py-2 pr-4 text-left">Client</th>
                <th className="py-2 pr-4 text-left">Editor</th>
                <th className="py-2 pr-4 text-left">Price</th>
                <th className="py-2 pr-4 text-left">Status</th>
                <th className="py-2 pr-4 text-left">Created</th>
                <th className="py-2 pr-4 text-left">Completed</th>
                <th className="py-2 pr-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rowsView.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="py-2 pr-4 max-w-[360px]">
                    <div className="font-medium">{r.client_name}</div>
                    <div className="text-muted-foreground line-clamp-1">{r.requirement_text}</div>
                  </td>
                  <td className="py-2 pr-4">{r.editor}</td>
                  <td className="py-2 pr-4 font-semibold">₹{Number(r.price).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    {r.status === "taken" && (
                      <Badge className="bg-warning/10 text-warning border-warning/20">In Progress</Badge>
                    )}
                    {r.status === "completed" && !r.isFailed && (
                      <Badge className="bg-success/10 text-success border-success/20">Success</Badge>
                    )}
                    {r.isFailed && (
                      <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>
                    )}
                    {r.status === "available" && (
                      <Badge className="bg-accent/10 text-accent border-accent/20">Available</Badge>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "-"}</td>
                  <td className="py-2 pr-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Inspect</Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-xl">
                        <DialogHeader>
                          <DialogTitle>Order Inspection</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Client</div><div className="col-span-2 font-medium">{selected?.client_name}</div></div>
                          <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Requirement</div><div className="col-span-2">{selected?.requirement_text}</div></div>
                          <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Price</div><div className="col-span-2 font-semibold">₹{Number(selected?.price ?? 0).toLocaleString()}</div></div>
                          {(() => {
                            const s = extractFromSheet(selected);
                            return (
                              <>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Email</div><div className="col-span-2 break-all">{s.email || '-'}</div></div>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Phone</div><div className="col-span-2">{s.phone || '-'}</div></div>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Service</div><div className="col-span-2">{s.service || '-'}</div></div>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Timeline</div><div className="col-span-2">{s.timeline || '-'}</div></div>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Budget</div><div className="col-span-2">{s.budget || '-'}</div></div>
                                <div className="grid grid-cols-3 gap-2"><div className="text-muted-foreground">Timestamp</div><div className="col-span-2">{s.timestamp || '-'}</div></div>
                              </>
                            );
                          })()}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
