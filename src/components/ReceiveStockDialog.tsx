import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { CATEGORIES } from "@/lib/categories";
import { formatTZS } from "@/lib/reports";
import { iso } from "@/components/DateRange";
import type { Item } from "@/lib/queries";

type Row = {
  key: number;
  mode: "existing" | "new";
  item_id: string;
  name: string;
  sku: string;
  category: string;
  quantity: string;
  unit_cost: string;
  unit_price: string;
};

const blank = (key: number, mode: Row["mode"] = "existing"): Row => ({
  key, mode, item_id: "", name: "", sku: "", category: "Other Spares", quantity: "", unit_cost: "", unit_price: "",
});
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function PartPicker({ items, value, onPick }: { items: Item[]; value: string; onPick: (it: Item) => void }) {
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="h-9 w-full justify-between font-normal">
          <span className="truncate">{current ? current.name : "Search for a part…"}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Type a name or code…" />
          <CommandList>
            <CommandEmpty>No part found. Use “New part” for items not in stock yet.</CommandEmpty>
            {items.map((i) => (
              <CommandItem
                key={i.id}
                value={`${i.name} ${i.sku ?? ""}`}
                onSelect={() => { onPick(i); setOpen(false); }}
              >
                <Check className={`mr-2 size-4 ${i.id === value ? "opacity-100" : "opacity-0"}`} />
                <span className="flex-1 truncate">{i.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{i.sku} · {i.quantity} in stock</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ReceiveStockDialog({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(iso(new Date()));
  const [rows, setRows] = useState<Row[]>([blank(1)]);
  const [nextKey, setNextKey] = useState(2);
  const [busy, setBusy] = useState(false);

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("spares_purchases").select("supplier").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return [...new Set((data ?? []).map((r) => r.supplier).filter((s): s is string => !!s))];
    },
  });

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const setRow = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = (mode: Row["mode"] = "existing") => { setRows((rs) => [...rs, blank(nextKey, mode)]); setNextKey((k) => k + 1); };

  function pick(key: number, it: Item) {
    setRow(key, {
      item_id: it.id,
      unit_cost: Number(it.cost_price) > 0 ? String(it.cost_price) : "",
      unit_price: Number(it.unit_price) > 0 ? String(it.unit_price) : "",
    });
  }

  const lineTotal = (r: Row) => (num(r.quantity) || 0) * (num(r.unit_cost) || 0);
  const totalCost = rows.reduce((s, r) => s + lineTotal(r), 0);
  const totalUnits = rows.reduce((s, r) => s + (num(r.quantity) || 0), 0);

  async function save() {
    const codes = new Set(items.map((i) => (i.sku ?? "").toLowerCase()).filter(Boolean));
    const seen = new Set<string>();
    for (const [n, r] of rows.entries()) {
      const label = `Row ${n + 1}`;
      const qty = num(r.quantity), cost = num(r.unit_cost);
      if (r.mode === "existing" && !r.item_id) return toast.error(`${label}: choose a part, or switch to “New part”.`);
      if (r.mode === "new" && !r.name.trim()) return toast.error(`${label}: enter the new part's name.`);
      if (r.mode === "new" && r.sku.trim()) {
        const c = r.sku.trim().toLowerCase();
        if (codes.has(c) || seen.has(c)) return toast.error(`${label}: the code ${r.sku.trim()} is already used.`);
        seen.add(c);
      }
      if (!Number.isInteger(qty) || qty < (r.mode === "existing" ? 1 : 0)) return toast.error(`${label}: enter how many were received.`);
      if (!(cost >= 0)) return toast.error(`${label}: enter the buying price (0 if unknown).`);
      if (r.unit_price.trim() !== "" && !(num(r.unit_price) >= 0)) return toast.error(`${label}: check the selling price.`);
    }
    setBusy(true);
    const { error } = await supabase.rpc("spares_receive_stock", {
      _supplier: supplier.trim(),
      _reference: reference.trim(),
      _date: date,
      _lines: rows.map((r) => ({
        ...(r.mode === "existing"
          ? { item_id: r.item_id }
          : { name: r.name.trim(), sku: r.sku.trim(), category: r.category }),
        quantity: num(r.quantity),
        unit_cost: num(r.unit_cost),
        unit_price: r.unit_price.trim() === "" ? null : num(r.unit_price),
      })),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Received ${rows.length} part${rows.length === 1 ? "" : "s"}${supplier.trim() ? ` from ${supplier.trim()}` : ""}`);
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["purchases"] });
    qc.invalidateQueries({ queryKey: ["suppliers"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader><DialogTitle>Receive stock from a supplier</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>Supplier</Label>
            <Input list="spares-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Who delivered this?" autoFocus />
            <datalist id="spares-suppliers">{(suppliers.data ?? []).map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div className="space-y-1"><Label>Invoice / reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" /></div>
          <div className="space-y-1"><Label>Date received</Label><Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
        </div>

        <div className="space-y-3">
          {rows.map((r, idx) => {
            const it = r.mode === "existing" ? byId.get(r.item_id) : undefined;
            const qty = num(r.quantity), cost = num(r.unit_cost);
            const avg = it && it.quantity > 0 && qty > 0 && cost >= 0
              ? Math.round((it.quantity * Number(it.cost_price) + qty * cost) / (it.quantity + qty))
              : null;
            return (
              <div key={r.key} className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-muted-foreground">{idx + 1}.</span>
                    <div className="inline-flex rounded-md border p-0.5">
                      {(["existing", "new"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setRow(r.key, { mode: m })}
                          className={`rounded px-3 py-1 text-xs font-medium ${r.mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          {m === "existing" ? "Part in stock" : "New part"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {rows.length > 1 && (
                    <button type="button" aria-label={`Remove row ${idx + 1}`} className="text-muted-foreground hover:text-destructive" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                {r.mode === "existing" ? (
                  <div className="space-y-1">
                    <PartPicker items={items} value={r.item_id} onPick={(i) => pick(r.key, i)} />
                    {it && <p className="text-xs text-muted-foreground">Now {it.quantity} in stock · current cost {formatTZS(Number(it.cost_price))} · selling {formatTZS(Number(it.unit_price))}</p>}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1 sm:col-span-1"><Label className="text-xs">Name</Label><Input value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} placeholder="e.g. Brake Light Switch (TVS)" /></div>
                    <div className="space-y-1"><Label className="text-xs">Code (optional)</Label><Input value={r.sku} onChange={(e) => setRow(r.key, { sku: e.target.value })} /></div>
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <select className={selectCls} value={r.category} onChange={(e) => setRow(r.key, { category: e.target.value })}>
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="space-y-1"><Label className="text-xs">Quantity received</Label><Input type="number" min={r.mode === "existing" ? 1 : 0} className="num" value={r.quantity} onChange={(e) => setRow(r.key, { quantity: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Buying price each (TSh)</Label><Input type="number" min={0} className="num" value={r.unit_cost} onChange={(e) => setRow(r.key, { unit_cost: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Selling price (TSh)</Label><Input type="number" min={0} className="num" value={r.unit_price} onChange={(e) => setRow(r.key, { unit_price: e.target.value })} placeholder={it ? "keep current" : ""} /></div>
                  <div className="space-y-1"><Label className="text-xs">Line cost</Label><div className="num flex h-9 items-center rounded-md bg-muted px-3 text-sm">{formatTZS(lineTotal(r))}</div></div>
                </div>
                {avg !== null && <p className="mt-2 text-xs text-muted-foreground">Cost per part becomes about {formatTZS(avg)} (averaged with the {it!.quantity} already in stock).</p>}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => addRow("existing")}><Plus className="size-4" /> Add another part</Button>
          <Button type="button" variant="outline" onClick={() => addRow("new")}><Plus className="size-4" /> Add a new part</Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "line" : "lines"} · {totalUnits} units · total cost <span className="num text-base font-semibold text-foreground">{formatTZS(totalCost)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Receive stock"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
