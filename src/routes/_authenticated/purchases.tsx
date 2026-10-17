import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/StatCard";
import { DateRange, iso, monthStart } from "@/components/DateRange";
import { purchasesQuery } from "@/lib/queries";
import { formatTZS } from "@/lib/reports";

export const Route = createFileRoute("/_authenticated/purchases")({
  validateSearch: (s: Record<string, unknown>) => ({
    from: typeof s["from"] === "string" ? s["from"] : monthStart(),
    to: typeof s["to"] === "string" ? s["to"] : iso(new Date()),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(purchasesQuery(deps.from, deps.to)),
  head: () => ({ meta: [{ title: "Purchases — Spares Desk" }] }),
  component: Purchases,
  errorComponent: ({ error }) => <div role="alert">{error.message}</div>,
});

function Purchases() {
  const { from, to } = Route.useSearch();
  const navigate = useNavigate({ from: "/purchases" });
  const { data: purchases } = useSuspenseQuery(purchasesQuery(from, to));
  const total = purchases.reduce((s, p) => s + Number(p.total_cost), 0);
  const units = purchases.reduce((s, p) => s + p.purchase_items.reduce((a, l) => a + l.quantity, 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Purchases" sub="Stock received from suppliers. Add a delivery with “Receive stock” on the Stock page." />
      <DateRange from={from} to={to} onChange={(f, t) => navigate({ search: { from: f, to: t } })} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Deliveries" value={String(purchases.length)} sub="in this period" />
        <StatCard label="Units received" value={String(units)} sub="parts added to stock" />
        <StatCard label="Total cost" value={formatTZS(total)} sub="paid to suppliers" />
      </div>
      <Card className="p-4">
        {purchases.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No deliveries recorded in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Parts</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="num whitespace-nowrap text-xs">{p.purchase_date}</TableCell>
                    <TableCell>{p.supplier ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                    <TableCell className="max-w-md text-sm">{p.purchase_items.map((l) => `${l.quantity}× ${l.item_name}`).join(", ")}</TableCell>
                    <TableCell className="num text-right">{formatTZS(Number(p.total_cost))}</TableCell>
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
