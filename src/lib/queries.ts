import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Sale } from "./reports";

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
