import type { Sale } from "./reports";

export type Expense = {
  id: string;
  expense_date: string; // YYYY-MM-DD
  category: string;
  description: string | null;
  amount: number;
};

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & wages",
  "Transport & delivery",
  "Electricity & water",
  "Phone & internet",
  "Licences & taxes",
  "Repairs & maintenance",
  "Marketing",
  "Stock loss / damage",
  "Other",
] as const;

export function pnl(sales: Sale[], expenses: Expense[]) {
  const revenue = sales.reduce((s, x) => s + Number(x.total), 0);
  const cogs = sales.reduce((s, x) => s + Number(x.cost_total), 0);
  const gross = revenue - cogs;
  const expenseTotal = expenses.reduce((s, x) => s + Number(x.amount), 0);
  const net = gross - expenseTotal;
  return {
    revenue,
    cogs,
    gross,
    grossMargin: revenue ? gross / revenue : 0,
    expenseTotal,
    net,
    netMargin: revenue ? net / revenue : 0,
  };
}

export function expensesByCategory(expenses: Expense[]) {
  const map = new Map<string, number>();
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + Number(e.amount));
  return [...map.entries()].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}

/** Profit per part category. `categoryOf` maps an item id to its category. */
export function profitByCategory(sales: Sale[], categoryOf: (itemId: string | null) => string) {
  const map = new Map<string, { category: string; units: number; revenue: number; cost: number }>();
  for (const s of sales)
    for (const l of s.sale_items) {
      const c = categoryOf(l.item_id);
      const row = map.get(c) ?? { category: c, units: 0, revenue: 0, cost: 0 };
      row.units += l.quantity;
      row.revenue += l.quantity * Number(l.unit_price);
      row.cost += l.quantity * Number(l.cost_price);
      map.set(c, row);
    }
  return [...map.values()]
    .map((r) => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue ? (r.revenue - r.cost) / r.revenue : 0 }))
    .sort((a, b) => b.profit - a.profit);
}

/** Sale lines sold for less than they cost. */
export function lossLines(sales: Sale[]) {
  const out: { date: string; name: string; qty: number; price: number; cost: number; loss: number }[] = [];
  for (const s of sales)
    for (const l of s.sale_items)
      if (Number(l.unit_price) < Number(l.cost_price))
        out.push({
          date: s.created_at,
          name: l.item_name,
          qty: l.quantity,
          price: Number(l.unit_price),
          cost: Number(l.cost_price),
          loss: l.quantity * (Number(l.cost_price) - Number(l.unit_price)),
        });
  return out.sort((a, b) => b.loss - a.loss);
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Revenue, gross profit, expenses and net per day (up to ~2 months) or per month (longer ranges). */
export function trend(sales: Sale[], expenses: Expense[], from: Date, to: Date) {
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const monthly = days > 62;
  const keyOf = (d: Date) => (monthly ? dayKey(d).slice(0, 7) : dayKey(d));
  const map = new Map<string, { key: string; revenue: number; gross: number; expenses: number; net: number }>();
  const cur = new Date(from.getFullYear(), from.getMonth(), monthly ? 1 : from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    const k = keyOf(cur);
    map.set(k, { key: k, revenue: 0, gross: 0, expenses: 0, net: 0 });
    if (monthly) cur.setMonth(cur.getMonth() + 1);
    else cur.setDate(cur.getDate() + 1);
  }
  for (const s of sales) {
    const row = map.get(keyOf(new Date(s.created_at)));
    if (row) {
      row.revenue += Number(s.total);
      row.gross += Number(s.total) - Number(s.cost_total);
    }
  }
  for (const e of expenses) {
    const row = map.get(monthly ? e.expense_date.slice(0, 7) : e.expense_date);
    if (row) row.expenses += Number(e.amount);
  }
  return {
    monthly,
    rows: [...map.values()].map((r) => ({ ...r, net: r.gross - r.expenses })),
  };
}
