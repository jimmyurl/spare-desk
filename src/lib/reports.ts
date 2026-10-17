export type SaleLine = {
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
};
export type Sale = {
  id: string;
  created_at: string;
  customer_name: string | null;
  payment_method: string;
  total: number;
  cost_total: number;
  sale_items: SaleLine[];
};

export const PAYMENT_METHODS = ["cash", "mpesa", "card", "credit"] as const;
export const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  mpesa: "Mobile money",
  card: "Card",
  credit: "Credit",
};

export function formatTZS(n: number) {
  return "TSh " + Math.round(n).toLocaleString("en-TZ");
}

export function summarize(sales: Sale[]) {
  const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
  const cost = sales.reduce((s, x) => s + Number(x.cost_total), 0);
  const units = sales.reduce(
    (s, x) => s + x.sale_items.reduce((a, l) => a + l.quantity, 0),
    0,
  );
  return {
    revenue,
    profit: revenue - cost,
    count: sales.length,
    units,
    average: sales.length ? revenue / sales.length : 0,
  };
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One row per calendar day between from and to (inclusive), zero-filled. */
export function byDay(sales: Sale[], from: Date, to: Date) {
  const map = new Map<string, { revenue: number; profit: number }>();
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    map.set(dayKey(cur), { revenue: 0, profit: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  for (const s of sales) {
    const k = dayKey(new Date(s.created_at));
    const row = map.get(k);
    if (row) {
      row.revenue += Number(s.total);
      row.profit += Number(s.total) - Number(s.cost_total);
    }
  }
  return [...map.entries()].map(([date, v]) => ({ date, ...v }));
}

export function topItems(sales: Sale[], limit = 10) {
  const map = new Map<string, { name: string; units: number; revenue: number; profit: number }>();
  for (const s of sales)
    for (const l of s.sale_items) {
      const key = l.item_id ?? l.item_name;
      const row = map.get(key) ?? { name: l.item_name, units: 0, revenue: 0, profit: 0 };
      row.units += l.quantity;
      row.revenue += l.quantity * Number(l.unit_price);
      row.profit += l.quantity * (Number(l.unit_price) - Number(l.cost_price));
      map.set(key, row);
    }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function byPayment(sales: Sale[]) {
  const map = new Map<string, number>();
  for (const s of sales) map.set(s.payment_method, (map.get(s.payment_method) ?? 0) + Number(s.total));
  return [...map.entries()].map(([method, total]) => ({
    method,
    label: PAYMENT_LABELS[method] ?? method,
    total,
  }));
}

export type StockStatus = "ok" | "low" | "out";
export function stockStatus(i: { quantity: number; min_quantity: number }): StockStatus {
  if (i.quantity <= 0) return "out";
  if (i.quantity <= i.min_quantity) return "low";
  return "ok";
}
