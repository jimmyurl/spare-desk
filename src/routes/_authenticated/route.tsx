import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { emailToUsername } from "@/lib/username";
import { ADMIN_ONLY, meQuery } from "@/lib/staff";
import { BarChart3, LayoutDashboard, LogOut, Package, Receipt, ShoppingCart, TrendingUp, Users, Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const me = await context.queryClient.fetchQuery({ ...meQuery, staleTime: 60_000 });
    if (me?.role === "cashier" && ADMIN_ONLY.some((p) => location.pathname.startsWith(p))) {
      throw redirect({ to: "/sell" });
    }
    return { user: data.user, me };
  },
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, admin: true },
  { to: "/sell", label: "New sale", icon: ShoppingCart, admin: false },
  { to: "/items", label: "Stock", icon: Package, admin: false },
  { to: "/profit", label: "Profit & Loss", icon: TrendingUp, admin: true },
  { to: "/reports", label: "Sales reports", icon: BarChart3, admin: true },
  { to: "/expenses", label: "Expenses", icon: Receipt, admin: true },
  { to: "/users", label: "Users", icon: Users, admin: true },
] as const;

function AppLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, me } = Route.useRouteContext();
  const links = nav.filter((n) => !n.admin || me?.role === "admin");
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <div className="flex items-center gap-2 px-5 py-5 font-display text-lg font-bold text-sidebar-accent-foreground">
          <Wrench className="size-5 text-sidebar-primary" /> Spares Desk
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {links.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground [&_svg]:text-sidebar-primary" }}
            >
              <n.icon className="size-4" /> {n.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border p-4 md:block">
          <div className="truncate text-xs text-sidebar-foreground/60">
            {me?.full_name || me?.username || emailToUsername(user.email)}
            {me && <span className="ml-1 uppercase tracking-wide">· {me.role}</span>}
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              qc.clear();
              navigate({ to: "/auth" });
            }}
            className="mt-2 flex items-center gap-2 text-sm hover:text-sidebar-accent-foreground"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
        <div className="stripe-accent h-1.5" />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {me ? <Outlet /> : <NoAccess />}
      </main>
    </div>
  );
}

function NoAccess() {
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-2xl font-bold">No access</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This login is not set up for Spares Desk, or it has been deactivated. Ask the shop admin to add you under Users.
      </p>
    </div>
  );
}
