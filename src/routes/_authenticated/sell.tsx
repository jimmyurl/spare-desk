import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/StatCard";
import { itemsQuery, type Item } from "@/lib/queries";
import { formatKES, PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/sell")({
  head: () => ({ meta: [{ title: "New sale — Spares Desk" }, { name: "description", content: "Record a counter sale." }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(itemsQuery),
  component: Sell,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

type Line = { item: Item; quantity: number; price: number };

function Sell() {
  const qc = useQueryClient();
  const { data: items } = useSuspenseQuery(itemsQuery);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Line[]>([]);
  const [customer, setCustomer] = useState("");
  const [payment, setPayment] = useState("cash");
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    return items.filter((i) => !s || i.name.toLowerCase().includes(s) || i.sku?.toLowerCase().includes(s)).slice(0, 40);
  }, [items, q]);

  const total = cart.reduce((s, l) => s + l.quantity * l.price, 0);

  function add(item: Item) {
    setCart((c) => {
      const ex = c.find((l) => l.item.id === item.id);
      if (ex) return c.map((l) => (l === ex ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { item, quantity: 1, price: Number(item.unit_price) }];
    });
  }
  const update = (id: string, patch: Partial<Line>) => setCart((c) => c.map((l) => (l.item.id === id ? { ...l, ...patch } : l)));

  async function complete() {
    setBusy(true);
    const { error } = await supabase.rpc("record_sale", {
      _customer: customer,
      _payment: payment,
      _lines: cart.map((l) => ({ item_id: l.item.id, quantity: l.quantity, unit_price: l.price })),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Sale recorded — ${formatKES(total)}`);
    setCart([]);
    setCustomer("");
    qc.invalidateQueries();
  }

  return (
    <div>
      <PageHeader title="New sale" sub="Tap parts to add them to the sale" />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-3">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search part name or code…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <ul className="max-h-[65vh] divide-y overflow-auto">
            {results.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() => add(i)}
                  disabled={i.quantity <= 0}
                  className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left text-sm hover:bg-accent disabled:opacity-40"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="num text-xs text-muted-foreground">{i.sku} · {i.quantity} in stock</div>
                  </div>
                  <span className="num shrink-0">{formatKES(i.unit_price)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col p-4 lg:col-span-2">
          <h3 className="mb-3 font-bold">This sale</h3>
          {cart.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No parts added yet.</p>}
          <ul className="space-y-3">
            {cart.map((l) => (
              <li key={l.item.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-2 text-sm font-medium">
                  {l.item.name}
                  <button onClick={() => setCart((c) => c.filter((x) => x !== l))} aria-label="Remove">
                    <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="icon" variant="outline" className="size-8" onClick={() => update(l.item.id, { quantity: Math.max(1, l.quantity - 1) })}><Minus className="size-3" /></Button>
                  <span className="num w-8 text-center">{l.quantity}</span>
                  <Button size="icon" variant="outline" className="size-8" onClick={() => update(l.item.id, { quantity: Math.min(l.item.quantity, l.quantity + 1) })}><Plus className="size-3" /></Button>
                  <span className="ml-auto text-xs text-muted-foreground">@</span>
                  <Input type="number" min={0} className="num h-8 w-28" value={l.price} onChange={(e) => update(l.item.id, { price: Number(e.target.value) })} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-3 border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Payment</Label>
                <Select value={payment} onValueChange={setPayment}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{PAYMENT_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Customer (optional)</Label>
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="num text-2xl font-semibold">{formatKES(total)}</span>
            </div>
            <Button className="w-full" size="lg" disabled={!cart.length || busy} onClick={complete}>Complete sale</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
