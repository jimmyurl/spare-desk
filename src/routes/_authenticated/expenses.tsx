import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/StatCard";
import { DateRange, iso, monthStart } from "@/components/DateRange";
import { expensesQuery } from "@/lib/queries";
import { EXPENSE_CATEGORIES, expensesByCategory } from "@/lib/pnl";
import { formatTZS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/expenses")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : monthStart(),
    to: typeof s.to === "string" ? s.to : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(expensesQuery(deps.from, deps.to)),
  head: () => ({ meta: [{ title: "Expenses — Spares Desk" }] }),
  component: Expenses,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function Expenses() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/expenses" });
  const qc = useQueryClient();
  const { data: expenses } = useSuspenseQuery(expensesQuery(from, to));
  const [adding, setAdding] = useState(false);
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCat = expensesByCategory(expenses);

  async function remove(id: string) {
    if (!window.confirm("Delete this expense?")) return;
    const { error } = await supabase.from("spares_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["expenses"] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Expenses" sub="Rent, salaries, transport and other running costs. These are subtracted from your profit.">
        <Button onClick={() => setAdding(true)}><Plus className="size-4" /> Add expense</Button>
      </PageHeader>
      <DateRange from={from} to={to} onChange={(f, t) => navigate({ search: { from: f, to: t } })} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total expenses" value={formatTZS(total)} sub={`${expenses.length} entries`} />
        {byCat.slice(0, 2).map((c) => (
          <StatCard key={c.category} label={c.category} value={formatTZS(c.total)} sub={`${Math.round((c.total / total) * 100)}% of expenses`} />
        ))}
      </div>

      <Card className="p-4">
        {expenses.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No expenses recorded in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="num text-xs">{e.expense_date}</TableCell>
                    <TableCell>{e.category}</TableCell>
                    <TableCell className="text-muted-foreground">{e.description}</TableCell>
                    <TableCell className="num text-right">{formatTZS(e.amount)}</TableCell>
                    <TableCell>
                      <button aria-label="Delete expense" className="text-muted-foreground hover:text-destructive" onClick={() => remove(e.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(iso(new Date()));
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  async function save() {
    const value = Number(amount);
    if (!(value > 0)) return toast.error("Enter an amount greater than 0");
    const { error } = await supabase
      .from("spares_expenses")
      .insert({ expense_date: date, category, description: description.trim() || null, amount: value });
    if (error) return toast.error(error.message);
    toast.success("Expense saved");
    qc.invalidateQueries({ queryKey: ["expenses"] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add expense</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Amount (TSh)</Label><Input type="number" min={0} className="num" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          </div>
          <div className="space-y-1">
            <Label>Category</Label>
            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. October shop rent" /></div>
          <Button className="w-full" onClick={save}>Save expense</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
