import { describe, expect, it } from "vitest";
import { byDay, stockStatus, summarize, topItems, type Sale } from "./reports";

const sale = (total: number, cost: number, created_at: string, lines: Sale["sale_items"]): Sale => ({
  id: Math.random().toString(),
  created_at,
  customer_name: null,
  payment_method: "cash",
  total,
  cost_total: cost,
  sale_items: lines,
});

const sales = [
  sale(1000, 600, "2026-10-10T10:00:00", [{ item_id: "a", item_name: "Chain", quantity: 2, unit_price: 500, cost_price: 300 }]),
  sale(300, 100, "2026-10-12T10:00:00", [{ item_id: "b", item_name: "Plug", quantity: 3, unit_price: 100, cost_price: 33.33 }]),
];

describe("reports", () => {
  it("profit is revenue minus cost", () => {
    const s = summarize(sales);
    expect(s.revenue).toBe(1300);
    expect(s.profit).toBe(600);
    expect(s.units).toBe(5);
  });
  it("byDay zero-fills days without sales", () => {
    const rows = byDay(sales, new Date(2026, 9, 10), new Date(2026, 9, 12));
    expect(rows.map((r) => r.revenue)).toEqual([1000, 0, 300]);
  });
  it("top items ranked by revenue", () => {
    expect(topItems(sales)[0].name).toBe("Chain");
  });
  it("stock is low at or below the minimum", () => {
    expect(stockStatus({ quantity: 5, min_quantity: 5 })).toBe("low");
    expect(stockStatus({ quantity: 0, min_quantity: 5 })).toBe("out");
    expect(stockStatus({ quantity: 6, min_quantity: 5 })).toBe("ok");
  });
});
