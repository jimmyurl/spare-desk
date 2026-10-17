import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackagePlus, Search } from "lucide-react";
import { ReceiveStockDialog } from "@/components/ReceiveStockDialog";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/StatCard";
import { itemsQuery, type Item } from "@/lib/queries";
import { formatTZS, stockStatus } from "@/lib/reports";
import { CATEGORIES } from "@/lib/categories";

const selectCls = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Stock — Spares Desk" }, { name: "description", content: "Manage parts, prices and stock levels." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(itemsQuery),
  component: Items,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

type Draft = Partial<Item> & { name: string };

function Items() {
  const { me } = Route.useRouteContext();
  const canEdit = me?.role === "admin";
  const { data: items } = useSuspenseQuery(itemsQuery);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "unpriced">("all");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [receiving, setReceiving] = useState(false);

  const rows = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter(
      (i) =>
        (!category || (i.category ?? "Other Spares") === category) &&
        (!s || i.name.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s)) &&
        (filter === "all" || (filter === "low" ? stockStatus(i) !== "ok" : Number(i.unit_price) === 0)),
    );
  }, [items, q, filter, category]);
  const value = items.reduce((s, i) => s + i.quantity * Number(i.cost_price), 0);

  return (
    <div>
      <PageHeader title="Stock" sub={`${items.length} parts · stock value ${formatTZS(value)} at cost`}>
        {canEdit && (
          <Button onClick={() => setReceiving(true)}>
            <PackagePlus className="size-4" /> Receive stock
          </Button>
        )}
      </PageHeader>
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(["all", "low", "unpriced"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" className="h-9" onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "low" ? "Low stock" : "No price"}
            </Button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Code</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((i) => {
                const st = stockStatus(i);
                return (
                  <TableRow key={i.id} className={canEdit ? "cursor-pointer" : ""} onClick={() => canEdit && setEditing(i)}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.category ?? "Other Spares"}</TableCell>
                    <TableCell className="num text-xs text-muted-foreground">{i.sku}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={st === "out" ? "destructive" : st === "low" ? "secondary" : "outline"} className="num">{i.quantity}</Badge>
                    </TableCell>
                    <TableCell className="num text-right">{formatTZS(i.cost_price)}</TableCell>
                    <TableCell className="num text-right">{formatTZS(i.unit_price)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
      {editing && <EditDialog draft={editing} onClose={() => setEditing(null)} />}
      {receiving && <ReceiveStockDialog items={items} onClose={() => setReceiving(false)} />}
    </div>
  );
}

function EditDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(draft);
  const [restock, setRestock] = useState(0);
  const set = (k: keyof Item, v: string | number) => setD((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!d.name.trim()) return toast.error("Name is required");
    const payload = {
      name: d.name,
      sku: d.sku || null,
      category: d.category || "Other Spares",
      location: d.location || null,
      description: d.description || null,
      quantity: Number(d.quantity ?? 0) + Number(restock || 0),
      min_quantity: Number(d.min_quantity ?? 5),
      unit_price: Number(d.unit_price ?? 0),
      cost_price: Number(d.cost_price ?? 0),
      updated_at: new Date().toISOString(),
    };
    const { error } = d.id ? await supabase.from("spares_items").update(payload).eq("id", d.id) : await supabase.from("spares_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["items"] });
    onClose();
  }

  const num = (k: keyof Item, label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min={0} className="num" value={(d[k] as number) ?? 0} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{d.id ? "Edit part" : "Add part"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name</Label><Input value={d.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Category</Label>
            <select className={`${selectCls} w-full`} value={d.category ?? "Other Spares"} onChange={(e) => set("category", e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Code</Label><Input value={d.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></div>
            <div className="space-y-1"><Label>Shelf / location</Label><Input value={d.location ?? ""} onChange={(e) => set("location", e.target.value)} /></div>
            {num("cost_price", "Buying price (TSh)")}
            {num("unit_price", "Selling price (TSh)")}
            {num("quantity", "In stock")}
            {num("min_quantity", "Alert when at or below")}
          </div>
          {d.id && (
            <div className="space-y-1">
              <Label>Received new stock (adds to quantity)</Label>
              <Input type="number" min={0} className="num" value={restock} onChange={(e) => setRestock(Number(e.target.value))} />
            </div>
          )}
          <Button className="w-full" onClick={save}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
