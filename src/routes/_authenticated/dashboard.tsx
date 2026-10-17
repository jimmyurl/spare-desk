import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, Receipt, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatCard } from "@/components/StatCard";
import { daysAgo, endOfDay, itemsQuery, salesQuery, startOfDay } from "@/lib/queries";
import { byDay, formatTZS, PAYMENT_LABELS, stockStatus, summarize, topItems } from "@/lib/reports";

const from = daysAgo(29).toISOString();
const to = endOfDay(new Date()).toISOString();

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Spares Desk" }, { name: "description", content: "Today's sales, profit and stock alerts." }] }),
  loader: ({ context }) =>
    Promise.all([context.queryClient.ensureQueryData(salesQuery(from, to)), context.queryClient.ensureQueryData(itemsQuery)]),
  component: Dashboard,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

function Dashboard() {
  const { data: sales } = useSuspenseQuery(salesQuery(from, to));
  const { data: items } = useSuspenseQuery(itemsQuery);
  const today = startOfDay(new Date());
  const todaySales = sales.filter((s) => new Date(s.created_at) >= today);
  const t = summarize(todaySales);
  const m = summarize(sales);
  const chart = byDay(sales, new Date(from), new Date());
  const top = topItems(sales, 6);
  const alerts = items.filter((i) => stockStatus(i) !== "ok");
  const unpriced = items.filter((i) => Number(i.unit_price) === 0).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" sub={today.toLocaleDateString("en-TZ", { weekday: "long", day: "numeric", month: "long" })}>
        <Button asChild><Link to="/sell">Record a sale</Link></Button>
      </PageHeader>

      {unpriced > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning bg-accent p-4 text-sm">
          <span><b>{unpriced}</b> items have no selling price or stock yet. Add them so you can sell.</span>
          <Button size="sm" variant="outline" asChild><Link to="/items">Update stock</Link></Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sales today" value={formatTZS(t.revenue)} sub={`${t.count} sales · ${t.units} parts`} icon={<Banknote className="size-4" />} />
        <StatCard label="Profit today" value={formatTZS(t.profit)} icon={<TrendingUp className="size-4" />} />
        <StatCard label="Last 30 days" value={formatTZS(m.revenue)} sub={`Profit ${formatTZS(m.profit)}`} icon={<Receipt className="size-4" />} />
        <StatCard label="Stock alerts" value={alerts.length} sub="low or out of stock" icon={<AlertTriangle className="size-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 font-bold">Sales — last 30 days</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} fontSize={11} stroke="var(--color-muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
                <Tooltip formatter={(v: number) => formatTZS(v)} />
                <Area dataKey="revenue" name="Sales" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.2} strokeWidth={2} />
                <Area dataKey="profit" name="Profit" stroke="var(--color-chart-3)" fill="var(--color-chart-3)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-bold">Best sellers (30 days)</h3>
          {top.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales yet.</p>
          ) : (
            <ul className="space-y-3">
              {top.map((x, i) => (
                <li key={x.name} className="flex items-center gap-3 text-sm">
                  <span className="num w-5 text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 truncate">{x.name}</span>
                  <span className="num font-medium">{formatTZS(x.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-bold">Recent sales</h3>
          {sales.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales recorded yet.</p>
          ) : (
            <ul className="divide-y">
              {sales.slice(0, 8).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate">{s.sale_items.map((l) => `${l.quantity}× ${l.item_name}`).join(", ")}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("en-TZ", { dateStyle: "short", timeStyle: "short" })} · {PAYMENT_LABELS[s.payment_method]}
                      {s.customer_name ? ` · ${s.customer_name}` : ""}
                    </div>
                  </div>
                  <span className="num ml-3 font-medium">{formatTZS(s.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-bold">Needs restocking</h3>
          <ul className="max-h-80 divide-y overflow-auto">
            {alerts.slice(0, 50).map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span className="truncate">{i.name}</span>
                <Badge variant={stockStatus(i) === "out" ? "destructive" : "secondary"} className="num ml-3">
                  {i.quantity} left
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
