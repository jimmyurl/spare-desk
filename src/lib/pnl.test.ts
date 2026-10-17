import { describe, expect, it } from "vitest";
import { expensesByCategory, lossLines, pnl, profitByCategory, trend, type Expense } from "./pnl";
import type { Sale } from "./reports";

const sale = (over: Partial<Sale>): Sale => ({
  id: "s", created_at: "2026-10-10T10:00:00", customer_name: null, payment_method: "cash",
  total: 0, cost_total: 0, sale_items: [], ...over,
});
const exp = (date: string, category: string, amount: number): Expense => ({
  id: date + category, expense_date: date, category, description: null, amount,
});

describe("profit and loss", () => {
  const sales = [
    sale({ total: 100000, cost_total: 60000, sale_items: [{ item_id: "a", item_name: "Piston", quantity: 2, unit_price: 50000, cost_price: 30000 }] }),
    sale({ total: 8000, cost_total: 10000, sale_items: [{ item_id: "b", item_name: "Plug", quantity: 1, unit_price: 8000, cost_price: 10000 }] }),
  ];
  const expenses = [exp("2026-10-01", "Rent", 20000), exp("2026-10-05", "Transport & delivery", 5000)];

  it("computes gross and net profit", () => {
    const r = pnl(sales, expenses);
    expect(r.revenue).toBe(108000);
    expect(r.gross).toBe(38000);
    expect(r.expenseTotal).toBe(25000);
    expect(r.net).toBe(13000);
  });
  it("shows a loss when expenses exceed gross profit", () => {
    expect(pnl(sales, [exp("2026-10-01", "Rent", 50000)]).net).toBe(-12000);
  });
  it("groups expenses, finds below-cost lines and profit per category", () => {
    expect(expensesByCategory(expenses)[0]).toEqual({ category: "Rent", total: 20000 });
    expect(lossLines(sales)).toHaveLength(1);
    expect(lossLines(sales)[0].loss).toBe(2000);
    const cats = profitByCategory(sales, (id) => (id === "a" ? "Pistons & Engine" : "Electrical & Lighting"));
    expect(cats[0].category).toBe("Pistons & Engine");
    expect(cats[0].profit).toBe(40000);
  });
  it("builds a daily trend with net per day", () => {
    const t = trend(sales, expenses, new Date(2026, 9, 1), new Date(2026, 9, 12));
    expect(t.monthly).toBe(false);
    expect(t.rows).toHaveLength(12);
    expect(t.rows.find((r) => r.key === "2026-10-10")?.gross).toBe(38000);
    expect(t.rows.find((r) => r.key === "2026-10-01")?.net).toBe(-20000);
  });
});
