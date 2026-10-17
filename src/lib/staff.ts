import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "admin" | "cashier";
export type Me = { role: Role; username: string | null; full_name: string | null } | null;

/** The signed-in person's Spares Desk role (null = signed in but not allowed to use the app). */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me> => {
    const { data, error } = await supabase.rpc("spares_me");
    if (error) throw error;
    return (data as Me) ?? null;
  },
});

/** Pages only admins may open. Cashiers are sent to the sales screen. */
export const ADMIN_ONLY = ["/dashboard", "/sales", "/reports", "/profit", "/expenses", "/users"];

export type StaffUser = {
  user_id: string;
  username: string;
  full_name: string | null;
  role: Role;
  active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

/** Calls the spares-users edge function (needs the service key, so it can't run in the browser). */
export async function callUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("spares-users", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      const j = await ctx.json().catch(() => null);
      if (j?.error) message = j.error;
    } else if (/not found|failed to send|fetch/i.test(message)) {
      message = "The user-management function is not deployed yet. See the README (Supabase → Edge Functions).";
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
