import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/StatCard";
import { DateRange, iso, parseISO } from "@/components/DateRange";
import { daysAgo, endOfDay, itemsQuery, salesListQuery, startOfDay, type SaleRow } from "@/lib/queries";
import { formatTZS, PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/sales")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s["from"] === "string" ? s["from"] : iso(daysAgo(6)),
    to: typeof s["to"] === "string" ? s["to"] : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesListQuery(startOfDay(parseISO(deps.from)).toISOString(), endOfDay(parseISO(deps.to)).toISOString())),
      context.queryClient.ensureQueryData(itemsQuery),
    ]),
  head: () => ({ meta: [{ title: "Sales — Spares Desk" }] }),
  component: SalesPage,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function SalesPage() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/sales" });
  const { data: sales } = useSuspenseQuery(salesListQuery(startOfDay(parseISO(from)).toISOString(), endOfDay(parseISO(to)).toISOString()));
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<SaleRow | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return sales;
    return sales.filter(
      (x) => (x.customer_name ?? "").toLowerCase().includes(s) || x.sale_items.some((l) => l.item_name.toLowerCase().includes(s)),
    );
  }, [sales, q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Sales" sub="Fix a wrong sale or delete it. Stock is adjusted automatically and every change is logged." />
      <DateRange from={from} to={to} onChange={(f, t) => navigate({ search: { from: f, to: t } })} />
      <Card className="p-4">
        <div className="relative mb-3 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search customer or part…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="num whitespace-nowrap text-xs">
                      {new Date(x.created_at).toLocaleString("en-TZ", { dateStyle: "short", timeStyle: "short" })}
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      {x.sale_items.map((l) => `${l.quantity}× ${l.item_name}`).join(", ")}
                      {x.customer_name && <span className="text-muted-foreground"> · {x.customer_name}</span>}
                      {x.edited_at && <Badge variant="secondary" className="ml-2">edited</Badge>}
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[x.payment_method] ?? x.payment_method}</TableCell>
                    <TableCell className="num text-right">{formatTZS(x.total)}</TableCell>
                    <TableCell className={`num text-right ${x.total - x.cost_total < 0 ? "text-destructive" : ""}`}>{formatTZS(x.total - x.cost_total)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditing(x)}><Pencil className="size-3.5" /> Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      {editing && <EditSale sale={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Line = { item_id: string | null; item_name: string; quantity: number; unit_price: number };

const toLocalInput = (iso8601: string) => {
  const d = new Date(iso8601);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function EditSale({ sale, onClose }: { sale: SaleRow; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: items } = useSuspenseQuery(itemsQuery);
  const [customer, setCustomer] = useState(sale.customer_name ?? "");
  const [payment, setPayment] = useState(sale.payment_method);
  const [soldAt, setSoldAt] = useState(toLocalInput(sale.created_at));
  const [lines, setLines] = useState<Line[]>(
    sale.sale_items.map((l) => ({ item_id: l.item_id, item_name: l.item_name, quantity: l.quantity, unit_price: Number(l.unit_price) })),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);

  // A part that was deleted from stock can't be re-edited, so only the header can change then.
  const linesLocked = sale.sale_items.some((l) => l.item_id === null);
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const originalQty = (id: string | null) => sale.sale_items.filter((l) => l.item_id === id).reduce((s, l) => s + l.quantity, 0);
  const available = (id: string | null) => (id ? (items.find((i) => i.id === id)?.quantity ?? 0) + originalQty(id) : 0);

  const setLine = (idx: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const finish = () => {
    qc.invalidateQueries({ queryKey: ["sales"] });
    qc.invalidateQueries({ queryKey: ["items"] });
    onClose();
  };

  function addPart(id: string) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    setLines((ls) =>
      ls.some((l) => l.item_id === id)
        ? ls.map((l) => (l.item_id === id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...ls, { item_id: id, item_name: it.name, quantity: 1, unit_price: Number(it.unit_price) }],
    );
  }

  async function save() {
    if (!linesLocked) {
      if (lines.length === 0) return toast.error("A sale needs at least one part. Use Delete sale instead.");
      for (const l of lines) {
        if (!(l.quantity > 0) || !Number.isInteger(l.quantity)) return toast.error(`Check the quantity for ${l.item_name}`);
        if (l.unit_price < 0) return toast.error(`Check the price for ${l.item_name}`);
        if (l.quantity > available(l.item_id)) return toast.error(`Only ${available(l.item_id)} of ${l.item_name} available`);
      }
    }
    setBusy(true);
    const changedDate = soldAt !== toLocalInput(sale.created_at);
    const { error } = await supabase.rpc("spares_update_sale", {
      _sale: sale.id,
      _customer: customer.trim(),
      _payment: payment,
      ...(linesLocked ? {} : { _lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, unit_price: l.unit_price })) }),
      ...(changedDate ? { _sold_at: new Date(soldAt).toISOString() } : {}),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Sale updated");
    finish();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.rpc("spares_delete_sale", { _sale: sale.id, _restock: restock });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(restock ? "Sale deleted and parts returned to stock" : "Sale deleted");
    finish();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Edit sale</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label>Customer</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="optional" /></div>
            <div className="space-y-1">
              <Label>Payment</Label>
              <select className={selectCls} value={payment} onChange={(e) => setPayment(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>Date &amp; time</Label><Input type="datetime-local" value={soldAt} onChange={(e) => setSoldAt(e.target.value)} /></div>
          </div>

          {linesLocked && (
            <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              One of the parts in this sale was removed from stock, so the parts and prices can no longer be edited. You can still change the customer, payment or date, or delete the sale.
            </p>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-36 text-right">Price each (TSh)</TableHead>
                  <TableHead className="w-28 text-right">Line total</TableHead>
                  {!linesLocked && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => (
                  <TableRow key={`${l.item_id}-${idx}`}>
                    <TableCell className="text-sm">{l.item_name}{!linesLocked && <div className="text-xs text-muted-foreground">up to {available(l.item_id)} available</div>}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={1} className="num h-8 text-right" disabled={linesLocked} value={l.quantity} onChange={(e) => setLine(idx, { quantity: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" min={0} className="num h-8 text-right" disabled={linesLocked} value={l.unit_price} onChange={(e) => setLine(idx, { unit_price: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="num text-right">{formatTZS(l.quantity * l.unit_price)}</TableCell>
                    {!linesLocked && (
                      <TableCell>
                        <button aria-label={`Remove ${l.item_name}`} className="text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}>
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!linesLocked && (
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" />
              <select className={selectCls} value="" onChange={(e) => e.target.value && addPart(e.target.value)} aria-label="Add a part">
                <option value="">Add another part…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.quantity} in stock)</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">New total</span>
            <span className="num text-xl font-semibold">{formatTZS(linesLocked ? Number(sale.total) : total)}</span>
          </div>

          {confirmDelete ? (
            <div className="space-y-3 rounded-md border border-destructive/50 p-3">
              <p className="text-sm font-medium text-destructive">Delete this sale? This cannot be undone.</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
                Return the parts to stock
              </label>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={remove} disabled={busy}>Yes, delete sale</Button>
                <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 className="size-4" /> Delete sale</Button>
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
