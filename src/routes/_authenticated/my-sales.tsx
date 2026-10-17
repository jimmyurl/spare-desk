import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/StatCard";
import { DateRange, iso, parseISO } from "@/components/DateRange";
import { endOfDay, mySalesQuery, startOfDay } from "@/lib/queries";
import { formatTZS, PAYMENT_LABELS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/my-sales")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s["from"] === "string" ? s["from"] : iso(new Date()),
    to: typeof s["to"] === "string" ? s["to"] : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(mySalesQuery(startOfDay(parseISO(deps.from)).toISOString(), endOfDay(parseISO(deps.to)).toISOString())),
  head: () => ({ meta: [{ title: "My sales — Spares Desk" }] }),
  component: MySales,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

function MySales() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/my-sales" });
  const { data: sales } = useSuspenseQuery(mySalesQuery(startOfDay(parseISO(from)).toISOString(), endOfDay(parseISO(to)).toISOString()));
  const total = sales.reduce((s, x) => s + x.total, 0);
  const units = sales.reduce((s, x) => s + x.lines.reduce((a, l) => a + l.quantity, 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="My sales" sub="Only the sales you recorded are shown here." />
      <DateRange from={from} to={to} onChange={(f, t) => navigate({ search: { from: f, to: t } })} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Sales" value={String(sales.length)} sub="recorded by you" />
        <StatCard label="Parts sold" value={String(units)} sub="units" />
        <StatCard label="Total sold" value={formatTZS(total)} sub="in this period" />
      </div>
      <Card className="p-4">
        {sales.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">You have not recorded any sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="num whitespace-nowrap text-xs">{new Date(x.created_at).toLocaleString("en-TZ", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                    <TableCell className="max-w-md text-sm">
                      {x.lines.map((l) => `${l.quantity}× ${l.item_name}`).join(", ")}
                      {x.customer_name && <span className="text-muted-foreground"> · {x.customer_name}</span>}
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[x.payment_method] ?? x.payment_method}</TableCell>
                    <TableCell className="num text-right">{formatTZS(x.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
