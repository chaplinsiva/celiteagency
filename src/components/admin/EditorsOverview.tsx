import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, ClipboardList, CheckCircle2 } from "lucide-react";

interface EditorInfo {
  user_id: string;
  full_name: string;
  email: string;
  currentTaken: number;
  completed: number;
}

export default function EditorsOverview() {
  const [loading, setLoading] = useState(true);
  const [editors, setEditors] = useState<EditorInfo[]>([]);

  useEffect(() => {
    fetchEditorsOverview();
  }, []);

  const fetchEditorsOverview = async () => {
    setLoading(true);

    const { data: roles, error: roleErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "editor");
    if (roleErr) {
      console.error(roleErr);
      setLoading(false);
      return;
    }
    const editorIdsRaw = (roles ?? []).map((r) => r.user_id);

    const { data: admins, error: adminErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (adminErr) {
      console.error(adminErr);
      setLoading(false);
      return;
    }
    const adminSet = new Set((admins ?? []).map((a) => a.user_id));
    const editorIds = editorIdsRaw.filter((id) => !adminSet.has(id));
    if (editorIds.length === 0) {
      setEditors([]);
      setLoading(false);
      return;
    }

    // 2) Get profiles for names/emails
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", editorIds);
    if (profErr) {
      console.error(profErr);
      setLoading(false);
      return;
    }

    // 3) Get orders grouped by taken_by + status
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("taken_by, status")
      .in("taken_by", editorIds);
    if (ordersErr) {
      console.error(ordersErr);
      setLoading(false);
      return;
    }

    const agg = new Map<string, { taken: number; completed: number }>();
    for (const id of editorIds) agg.set(id, { taken: 0, completed: 0 });
    for (const o of orders ?? []) {
      const id = o.taken_by as string | null;
      if (!id) continue;
      const rec = agg.get(id) ?? { taken: 0, completed: 0 };
      if (o.status === "taken") rec.taken += 1;
      else if (o.status === "completed") rec.completed += 1;
      agg.set(id, rec);
    }

    const info: EditorInfo[] = (profiles ?? []).map((p) => ({
      user_id: p.id,
      full_name: p.full_name || p.email,
      email: p.email,
      currentTaken: agg.get(p.id)?.taken ?? 0,
      completed: agg.get(p.id)?.completed ?? 0,
    }));

    // Sort by current workload desc
    info.sort((a, b) => b.currentTaken - a.currentTaken);

    setEditors(info);
    setLoading(false);
  };

  const totalEditors = editors.length;
  const totalCurrentlyWorking = useMemo(
    () => editors.reduce((sum, e) => sum + (e.currentTaken > 0 ? 1 : 0), 0),
    [editors]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-effect border-border/50 hover:border-primary/30 transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> Total Editors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">{totalEditors}</div>
          </CardContent>
        </Card>
        <Card className="glass-effect border-border/50 hover:border-primary/30 transition-all">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
              <ClipboardList className="h-4 w-4" /> Editors Working Now
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-extrabold tracking-tight">{totalCurrentlyWorking}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {editors.map((e, idx) => (
          <Card
            key={e.user_id}
            className="glass-effect border-border/50 hover:border-primary/30 hover:shadow-md transition-all animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{e.full_name}</CardTitle>
                <Badge variant="secondary">{e.email}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-warning" />
                  <span>In Progress: <strong>{e.currentTaken}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span>Completed: <strong>{e.completed}</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
