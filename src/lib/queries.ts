import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "./reports";
import type { Expense } from "./pnl";

export type Item = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  location: string | null;
  category: string | null;
  quantity: number;
  min_quantity: number;
  unit_price: number;
  cost_price: number;
};

export const itemsQuery = queryOptions({
  queryKey: ["items"],
  queryFn: async (): Promise<Item[]> => {
    const { data, error } = await supabase.from("spares_items").select("*").order("name");
    if (error) throw error;
    return data as Item[];
  },
});

export const salesQuery = (fromISO: string, toISO: string) =>
  queryOptions({
    queryKey: ["sales", fromISO, toISO],
    queryFn: async (): Promise<Sale[]> => {
      const { data, error } = await supabase
        .from("spares_sales")
        .select("id, created_at, customer_name, payment_method, total, cost_total, sale_items:spares_sale_items(item_id, item_name, quantity, unit_price, cost_price)")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as unknown as Sale[];
    },
  });

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function daysAgo(n: number) {
  const d = startOfDay(new Date());
  d.setDate(d.getDate() - n);
  return d;
}

export const expensesQuery = (fromDate: string, toDate: string) =>
  queryOptions({
    queryKey: ["expenses", fromDate, toDate],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        .from("spares_expenses")
        .select("id, expense_date, category, description, amount")
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .order("expense_date", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []).map((e) => ({ ...e, amount: Number(e.amount) })) as Expense[];
    },
  });

export type SaleRow = Sale & { edited_at: string | null };

/** Sales list for the admin Sales page (includes the "edited" marker). */
export const salesListQuery = (fromISO: string, toISO: string) =>
  queryOptions({
    queryKey: ["sales", "list", fromISO, toISO],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from("spares_sales")
        .select("id, created_at, edited_at, customer_name, payment_method, total, cost_total, sale_items:spares_sale_items(item_id, item_name, quantity, unit_price, cost_price)")
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as SaleRow[];
    },
  });

export type Purchase = {
  id: string;
  purchase_date: string;
  supplier: string | null;
  reference: string | null;
  total_cost: number;
  purchase_items: { item_name: string; quantity: number; unit_cost: number }[];
};

export const purchasesQuery = (fromDate: string, toDate: string) =>
  queryOptions({
    queryKey: ["purchases", fromDate, toDate],
    queryFn: async (): Promise<Purchase[]> => {
      const { data, error } = await supabase
        .from("spares_purchases")
        .select("id, purchase_date, supplier, reference, total_cost, purchase_items:spares_purchase_items(item_name, quantity, unit_cost)")
        .gte("purchase_date", fromDate)
        .lte("purchase_date", toDate)
        .order("purchase_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as Purchase[];
    },
  });
