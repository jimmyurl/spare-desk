import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/StatCard";
import { daysAgo, endOfDay, salesQuery, startOfDay } from "@/lib/queries";
import { byDay, byPayment, formatTZS, PAYMENT_LABELS, summarize, topItems } from "@/lib/reports";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : iso(daysAgo(6)),
    to: typeof s.to === "string" ? s.to : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(salesQuery(startOfDay(parse(deps.from)).toISOString(), endOfDay(parse(deps.to)).toISOString())),
  head: () => ({ meta: [{ title: "Reports — Spares Desk" }, { name: "description", content: "Sales and profit reports by period." }] }),
  component: Reports,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)"];

function Reports() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/reports" });
  const fromD = parse(from), toD = parse(to);
  const { data: sales } = useSuspenseQuery(salesQuery(startOfDay(fromD).toISOString(), endOfDay(toD).toISOString()));
  const s = summarize(sales);
  const days = byDay(sales, fromD, toD);
  const top = topItems(sales, 15);
  const pay = byPayment(sales);
  const go = (f: Date, t: Date) => navigate({ search: { from: iso(f), to: iso(t) } });
  const now = new Date();

  function exportCsv() {
    const rows = [["Date", "Customer", "Payment", "Part", "Qty", "Price", "Line total", "Line profit"]];
    for (const x of sales)
      for (const l of x.sale_items)
        rows.push([
          new Date(x.created_at).toLocaleString("en-TZ"), x.customer_name ?? "", PAYMENT_LABELS[x.payment_method] ?? x.payment_method,
          l.item_name, String(l.quantity), String(l.unit_price), String(l.quantity * l.unit_price), String(l.quantity * (l.unit_price - l.cost_price)),
        ]);
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `sales_${from}_to_${to}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" sub={`${fromD.toLocaleDateString("en-TZ")} – ${toD.toLocaleDateString("en-TZ")}`}>
        <Button variant="outline" onClick={exportCsv} disabled={!sales.length}><Download className="size-4" /> Export</Button>
      </PageHeader>

      <Card className="flex flex-wrap items-end gap-2 p-4">
        <Button size="sm" variant="outline" onClick={() => go(now, now)}>Today</Button>
        <Button size="sm" variant="outline" onClick={() => go(daysAgo(6), now)}>7 days</Button>
        <Button size="sm" variant="outline" onClick={() => go(daysAgo(29), now)}>30 days</Button>
        <Button size="sm" variant="outline" onClick={() => go(new Date(now.getFullYear(), now.getMonth(), 1), now)}>This month</Button>
        <Button size="sm" variant="outline" onClick={() => go(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0))}>Last month</Button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <Input type="date" className="w-40" value={from} onChange={(e) => e.target.value && navigate({ search: { from: e.target.value, to } })} />
          –
          <Input type="date" className="w-40" value={to} onChange={(e) => e.target.value && navigate({ search: { from, to: e.target.value } })} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales" value={formatTZS(s.revenue)} />
        <StatCard label="Profit" value={formatTZS(s.profit)} sub={s.revenue ? `${Math.round((s.profit / s.revenue) * 100)}% margin` : undefined} />
        <StatCard label="Transactions" value={s.count} sub={`${s.units} parts sold`} />
        <StatCard label="Average sale" value={formatTZS(s.average)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 font-bold">Daily sales & profit</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip formatter={(v: number) => formatTZS(v)} />
                <Bar dataKey="revenue" name="Sales" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="profit" name="Profit" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-bold">By payment method</h3>
          {pay.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this period.</p> : (
            <>
              <div className="h-40">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pay} dataKey="total" nameKey="label" innerRadius={40} outerRadius={65}>
                      {pay.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatTZS(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {pay.map((p, i) => (
                  <li key={p.method} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1">{p.label}</span>
                    <span className="num">{formatTZS(p.total)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-4 font-bold">Top parts</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Part</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
          <TableBody>
            {top.map((t) => (
              <TableRow key={t.name}><TableCell>{t.name}</TableCell><TableCell className="num text-right">{t.units}</TableCell><TableCell className="num text-right">{formatTZS(t.revenue)}</TableCell><TableCell className="num text-right">{formatTZS(t.profit)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 font-bold">All sales ({sales.length})</h3>
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Parts</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
          <TableBody>
            {sales.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="num whitespace-nowrap text-xs">{new Date(x.created_at).toLocaleString("en-TZ", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                <TableCell className="text-sm">{x.sale_items.map((l) => `${l.quantity}× ${l.item_name}`).join(", ")}{x.customer_name ? <span className="text-muted-foreground"> · {x.customer_name}</span> : null}</TableCell>
                <TableCell>{PAYMENT_LABELS[x.payment_method]}</TableCell>
                <TableCell className="num text-right">{formatTZS(x.total)}</TableCell>
                <TableCell className="num text-right">{formatTZS(x.total - x.cost_total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
