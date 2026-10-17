import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/StatCard";
import { DateRange, iso, monthStart, parseISO } from "@/components/DateRange";
import { endOfDay, expensesQuery, itemsQuery, salesQuery, startOfDay } from "@/lib/queries";
import { expensesByCategory, lossLines, pnl, profitByCategory, trend } from "@/lib/pnl";
import { formatTZS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/profit")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s.from === "string" ? s.from : monthStart(),
    to: typeof s.to === "string" ? s.to : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(salesQuery(startOfDay(parseISO(deps.from)).toISOString(), endOfDay(parseISO(deps.to)).toISOString())),
      context.queryClient.ensureQueryData(expensesQuery(deps.from, deps.to)),
      context.queryClient.ensureQueryData(itemsQuery),
    ]),
  head: () => ({ meta: [{ title: "Profit & Loss — Spares Desk" }] }),
  component: ProfitLoss,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const tone = (n: number) => (n < 0 ? "text-destructive" : "text-success");

function ProfitLoss() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/profit" });
  const fromD = parseISO(from), toD = parseISO(to);
  const { data: sales } = useSuspenseQuery(salesQuery(startOfDay(fromD).toISOString(), endOfDay(toD).toISOString()));
  const { data: expenses } = useSuspenseQuery(expensesQuery(from, to));
  const { data: items } = useSuspenseQuery(itemsQuery);

  const r = pnl(sales, expenses);
  const exp = expensesByCategory(expenses);
  const catOf = new Map(items.map((i) => [i.id, i.category ?? "Other Spares"]));
  const cats = profitByCategory(sales, (id) => (id ? catOf.get(id) ?? "Other Spares" : "Other Spares"));
  const losses = lossLines(sales);
  const lossTotal = losses.reduce((s, l) => s + l.loss, 0);
  const t = trend(sales, expenses, fromD, toD);
  const credit = sales.filter((s) => s.payment_method === "credit").reduce((s, x) => s + Number(x.total), 0);
  const stockValue = items.reduce((s, i) => s + i.quantity * Number(i.cost_price), 0);
  const isLoss = r.net < 0;

  function exportCsv() {
    const rows: string[][] = [
      ["Profit & Loss", `${from} to ${to}`],
      ["Revenue (sales)", String(r.revenue)],
      ["Cost of goods sold", String(r.cogs)],
      ["Gross profit", String(r.gross)],
      ...exp.map((e) => [`Expense: ${e.category}`, String(e.total)]),
      ["Total expenses", String(r.expenseTotal)],
      [isLoss ? "NET LOSS" : "NET PROFIT", String(r.net)],
      [],
      ["Part category", "Units", "Revenue", "Cost", "Profit", "Margin"],
      ...cats.map((c) => [c.category, String(c.units), String(c.revenue), String(c.cost), String(c.profit), pct(c.margin)]),
    ];
    const csv = rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `profit_loss_${from}_to_${to}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profit & Loss" sub={`${fromD.toLocaleDateString("en-TZ")} – ${toD.toLocaleDateString("en-TZ")}`}>
        <Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export</Button>
      </PageHeader>
      <DateRange from={from} to={to} onChange={(f, tt) => navigate({ search: { from: f, to: tt } })} />

      <Card className={`p-6 ${isLoss ? "border-destructive/50" : ""}`}>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{isLoss ? "Net loss" : "Net profit"}</div>
        <div className={`num mt-1 text-4xl font-semibold ${tone(r.net)}`}>{formatTZS(r.net)}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {r.revenue ? `${pct(r.netMargin)} of sales` : "No sales in this period"} · after {formatTZS(r.expenseTotal)} expenses
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales" value={formatTZS(r.revenue)} sub={`${sales.length} sales`} />
        <StatCard label="Gross profit" value={formatTZS(r.gross)} sub={`${pct(r.grossMargin)} margin`} />
        <StatCard label="Sold on credit" value={formatTZS(credit)} sub="included in sales, may not be paid yet" />
        <StatCard label="Stock value" value={formatTZS(stockValue)} sub="current stock at cost" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 font-bold">Statement</h3>
          <Table>
            <TableBody>
              <TableRow><TableCell className="font-medium">Sales</TableCell><TableCell className="num text-right">{formatTZS(r.revenue)}</TableCell></TableRow>
              <TableRow><TableCell className="text-muted-foreground">Cost of parts sold</TableCell><TableCell className="num text-right">− {formatTZS(r.cogs)}</TableCell></TableRow>
              <TableRow className="bg-muted/40"><TableCell className="font-semibold">Gross profit</TableCell><TableCell className={`num text-right font-semibold ${tone(r.gross)}`}>{formatTZS(r.gross)}</TableCell></TableRow>
              {exp.map((e) => (
                <TableRow key={e.category}><TableCell className="pl-6 text-muted-foreground">{e.category}</TableCell><TableCell className="num text-right">− {formatTZS(e.total)}</TableCell></TableRow>
              ))}
              {exp.length === 0 && <TableRow><TableCell className="pl-6 text-muted-foreground">No expenses recorded</TableCell><TableCell className="num text-right">− {formatTZS(0)}</TableCell></TableRow>}
              <TableRow><TableCell className="font-medium">Total expenses</TableCell><TableCell className="num text-right">− {formatTZS(r.expenseTotal)}</TableCell></TableRow>
              <TableRow className="bg-muted/40"><TableCell className="font-bold">{isLoss ? "Net loss" : "Net profit"}</TableCell><TableCell className={`num text-right font-bold ${tone(r.net)}`}>{formatTZS(r.net)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5 lg:col-span-3">
          <h3 className="mb-4 font-bold">{t.monthly ? "Monthly" : "Daily"} gross profit, expenses and net</h3>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={t.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="key" tickFormatter={(k: string) => (t.monthly ? k : k.slice(5))} fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip formatter={(v: number) => formatTZS(v)} />
                <Legend />
                <Bar dataKey="gross" name="Gross profit" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="var(--color-chart-4)" radius={[3, 3, 0, 0]} />
                <Line dataKey="net" name="Net" stroke="var(--color-foreground)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="mb-3 font-bold">Profit by part category</h3>
        {cats.length === 0 ? <p className="text-sm text-muted-foreground">No sales in this period.</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cats.map((c) => (
                  <TableRow key={c.category}>
                    <TableCell className="font-medium">{c.category}</TableCell>
                    <TableCell className="num text-right">{c.units}</TableCell>
                    <TableCell className="num text-right">{formatTZS(c.revenue)}</TableCell>
                    <TableCell className="num text-right">{formatTZS(c.cost)}</TableCell>
                    <TableCell className={`num text-right ${tone(c.profit)}`}>{formatTZS(c.profit)}</TableCell>
                    <TableCell className="num text-right">{pct(c.margin)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {losses.length > 0 && (
        <Card className="border-destructive/40 p-5">
          <h3 className="mb-1 flex items-center gap-2 font-bold text-destructive"><AlertTriangle className="size-4" /> Sold below cost</h3>
          <p className="mb-3 text-sm text-muted-foreground">{losses.length} sale lines were sold for less than they cost, losing {formatTZS(lossTotal)} in total. Check the prices set on these parts.</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Part</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sold at</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {losses.slice(0, 20).map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="num whitespace-nowrap text-xs">{new Date(l.date).toLocaleString("en-TZ", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell className="num text-right">{l.qty}</TableCell>
                    <TableCell className="num text-right">{formatTZS(l.price)}</TableCell>
                    <TableCell className="num text-right">{formatTZS(l.cost)}</TableCell>
                    <TableCell className="num text-right text-destructive">{formatTZS(l.loss)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
